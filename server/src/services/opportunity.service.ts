import { isValidObjectId } from 'mongoose';
import { Application } from '../models/Application';
import { Bookmark } from '../models/Bookmark';
import { Opportunity } from '../models/Opportunity';
import { Role, User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { branchMatch, isEligible, yearMatch } from '../utils/eligibility';
import { RecProfile, scoreOpportunity } from '../utils/recommend';
import {
  CreateOpportunityInput,
  ListOpportunitiesQuery,
  UpdateOpportunityInput,
} from '../validators/opportunity.schema';

export type Actor = { id: string; role: Role };

const DAY_MS = 24 * 60 * 60 * 1000;
const notFound = () => new ApiError(404, 'Opportunity not found');

export async function getProfile(actor: Actor): Promise<RecProfile> {
  const user = await User.findById(actor.id).select('branch year skills');
  if (!user) throw new ApiError(401, 'User no longer exists');
  return { branch: user.branch, year: user.year, skills: user.skills ?? [] };
}

const canManage = (actor: Actor, createdBy: unknown) => actor.role === 'COLLEGE_ADMIN' || String(createdBy) === actor.id;

// Adds "what does this mean for me?" to each opportunity: saved? applied? eligible?
async function annotate(actor: Actor, profile: RecProfile, docs: any[]) {
  if (docs.length === 0) return [];
  const ids = docs.map((d) => d._id);
  const [bookmarks, applications] = await Promise.all([
    Bookmark.find({ user: actor.id, opportunity: { $in: ids } }).select('opportunity'),
    Application.find({ user: actor.id, opportunity: { $in: ids } }).select('opportunity status'),
  ]);
  const saved = new Set(bookmarks.map((b) => String(b.opportunity)));
  const statusById = new Map(applications.map((a) => [String(a.opportunity), a.status]));
  return docs.map((d) => ({
    ...d.toObject(),
    viewer: {
      bookmarked: saved.has(String(d._id)),
      applicationStatus: statusById.get(String(d._id)) ?? null,
      eligible: isEligible(profile, d.eligibility),
    },
  }));
}

const SORTS: Record<string, Record<string, 1 | -1>> = {
  deadline: { deadline: 1 }, // soonest first
  newest: { createdAt: -1 },
  popular: { bookmarkCount: -1, applicationCount: -1, deadline: 1 },
};

export async function browse(actor: Actor, query: ListOpportunitiesQuery) {
  await Opportunity.init(); // make sure the text index exists before a $text search
  const profile = await getProfile(actor);
  const now = new Date();

  const filter: Record<string, any> = {};
  if (query.mine) {
    filter.createdBy = actor.id;
  } else {
    filter.isActive = true;
    if (!query.includeExpired) filter.deadline = { $gte: now };
  }
  if (query.q) filter.$text = { $search: query.q };
  if (query.category) filter.category = query.category;
  if (query.skills && query.skills.length > 0) filter.skills = { $in: query.skills };
  if (query.closingWithin) {
    filter.deadline = { $gte: now, $lte: new Date(now.getTime() + query.closingWithin * DAY_MS) };
  }

  const and: Record<string, any>[] = [];
  if (query.eligibleForMe) and.push(branchMatch(profile.branch), yearMatch(profile.year));
  if (query.branch) and.push(branchMatch(query.branch));
  if (query.year) and.push(yearMatch(query.year));
  if (and.length > 0) filter.$and = and;

  const [docs, total] = await Promise.all([
    Opportunity.find(filter)
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('createdBy', 'name role'),
    Opportunity.countDocuments(filter),
  ]);
  return {
    items: await annotate(actor, profile, docs),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
  };
}

export async function getOpportunity(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw notFound();
  const doc = await Opportunity.findById(id).populate('createdBy', 'name role');
  if (!doc) throw notFound();
  // Deactivated opportunities are visible only to the person who posted them (and admins)
  const creatorId = (doc.createdBy as any)?._id ?? doc.createdBy;
  if (!doc.isActive && !canManage(actor, creatorId)) throw notFound();
  const profile = await getProfile(actor);
  return (await annotate(actor, profile, [doc]))[0];
}

export async function createOpportunity(actor: Actor, input: CreateOpportunityInput) {
  if (input.deadline.getTime() <= Date.now()) throw new ApiError(400, 'The deadline must be in the future');
  const doc = await Opportunity.create({ ...input, createdBy: actor.id });
  return getOpportunity(actor, doc.id);
}

async function loadManageable(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw notFound();
  const doc = await Opportunity.findById(id);
  if (!doc) throw notFound();
  if (!canManage(actor, doc.createdBy)) throw new ApiError(403, 'You can only manage opportunities you posted');
  return doc;
}

export async function updateOpportunity(actor: Actor, id: string, input: UpdateOpportunityInput) {
  const doc = await loadManageable(actor, id);
  if (input.deadline && input.deadline.getTime() <= Date.now()) {
    throw new ApiError(400, 'The deadline must be in the future (to hide it instead, set isActive to false)');
  }
  const { eligibility, ...rest } = input;
  const set: Record<string, unknown> = { ...rest };
  // Dotted paths update only the eligibility fields that were sent
  if (eligibility) {
    for (const [key, value] of Object.entries(eligibility)) {
      if (value !== undefined) set[`eligibility.${key}`] = value;
    }
  }
  await Opportunity.updateOne({ _id: doc._id }, { $set: set }, { runValidators: true });
  return getOpportunity(actor, id);
}

export async function deleteOpportunity(actor: Actor, id: string) {
  const doc = await loadManageable(actor, id);
  // Remove everything that points at it, so nothing is left dangling
  await Promise.all([Bookmark.deleteMany({ opportunity: doc._id }), Application.deleteMany({ opportunity: doc._id })]);
  await doc.deleteOne();
}

/*
 * Recommendations. Step 1 (database): only opportunities that are active, not expired,
 * open to this student's branch and year, and not already applied to.
 * Step 2 (code): score the candidates with scoreOpportunity() and keep the relevant ones.
 */
export async function recommend(actor: Actor, limit: number) {
  const profile = await getProfile(actor);
  const now = new Date();

  const [bookmarkedIds, appliedIds] = await Promise.all([
    Bookmark.distinct('opportunity', { user: actor.id }),
    Application.distinct('opportunity', { user: actor.id }),
  ]);
  // "Interest" is learned from what the student has saved or applied to
  const engagedCategories = new Set<string>(
    await Opportunity.distinct('category', { _id: { $in: [...bookmarkedIds, ...appliedIds] } })
  );

  const candidates = await Opportunity.find({
    isActive: true,
    deadline: { $gte: now },
    _id: { $nin: appliedIds },
    $and: [branchMatch(profile.branch), yearMatch(profile.year)],
  })
    .sort({ deadline: 1 })
    .limit(200); // plenty for one campus; keeps the scoring step cheap

  const ranked = candidates
    .map((doc) => ({ doc, ...scoreOpportunity(profile, doc, engagedCategories, now) }))
    .filter((r) => r.relevant)
    .sort((a, b) => b.score - a.score || a.doc.deadline.getTime() - b.doc.deadline.getTime())
    .slice(0, limit);

  const annotated = await annotate(actor, profile, ranked.map((r) => r.doc));
  return ranked.map((r, i) => ({ ...annotated[i], score: r.score, reasons: r.reasons }));
}
