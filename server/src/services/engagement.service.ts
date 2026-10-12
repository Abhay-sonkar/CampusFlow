import { isValidObjectId } from 'mongoose';
import { Application } from '../models/Application';
import { Bookmark } from '../models/Bookmark';
import { Opportunity } from '../models/Opportunity';
import { ApiError } from '../utils/ApiError';
import { isEligible } from '../utils/eligibility';
import { ListApplicationsQuery, ListBookmarksQuery } from '../validators/application.schema';
import { Actor, getProfile } from './opportunity.service';

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;
const oppNotFound = () => new ApiError(404, 'Opportunity not found');
const appNotFound = () => new ApiError(404, 'Application not found');

const paging = (total: number, page: number, limit: number) => ({ page, limit, total, pages: Math.ceil(total / limit) });

// ---------- Bookmarks ----------

export async function addBookmark(actor: Actor, opportunityId: string) {
  if (!isValidObjectId(opportunityId)) throw oppNotFound();
  const opportunity = await Opportunity.findOne({ _id: opportunityId, isActive: true }).select('_id');
  if (!opportunity) throw oppNotFound();

  await Bookmark.init(); // the unique index must exist so duplicates are caught
  try {
    await Bookmark.create({ user: actor.id, opportunity: opportunity._id });
    await Opportunity.updateOne({ _id: opportunity._id }, { $inc: { bookmarkCount: 1 } });
  } catch (err) {
    // Already saved: that is fine, saving twice does nothing (and the counter is not touched)
    if (!isDuplicateKey(err)) throw err;
  }
}

export async function removeBookmark(actor: Actor, opportunityId: string) {
  if (!isValidObjectId(opportunityId)) throw oppNotFound();
  const result = await Bookmark.deleteOne({ user: actor.id, opportunity: opportunityId });
  if (result.deletedCount > 0) {
    await Opportunity.updateOne({ _id: opportunityId }, { $inc: { bookmarkCount: -1 } });
  }
}

export async function listBookmarks(actor: Actor, query: ListBookmarksQuery) {
  const filter = { user: actor.id };
  const [docs, total] = await Promise.all([
    Bookmark.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('opportunity'),
    Bookmark.countDocuments(filter),
  ]);
  const items = docs.map((b: any) => ({ bookmarkedAt: b.createdAt, opportunity: b.opportunity }));
  return { items, pagination: paging(total, query.page, query.limit) };
}

// ---------- Application tracker ----------

export async function applyTo(actor: Actor, opportunityId: string, notes?: string) {
  if (!isValidObjectId(opportunityId)) throw oppNotFound();
  const opportunity = await Opportunity.findOne({ _id: opportunityId, isActive: true });
  if (!opportunity) throw oppNotFound();
  if (opportunity.deadline.getTime() <= Date.now()) throw new ApiError(409, 'The deadline for this opportunity has passed');

  const profile = await getProfile(actor);
  if (!isEligible(profile, opportunity.eligibility)) {
    throw new ApiError(403, 'You are not eligible for this opportunity (check your branch and year in your profile)');
  }

  await Application.init();
  try {
    const application = await Application.create({ user: actor.id, opportunity: opportunity._id, notes });
    await Opportunity.updateOne({ _id: opportunity._id }, { $inc: { applicationCount: 1 } });
    return application.populate('opportunity', 'title category organization deadline');
  } catch (err) {
    if (isDuplicateKey(err)) throw new ApiError(409, 'You are already tracking an application for this opportunity');
    throw err;
  }
}

export async function listApplications(actor: Actor, query: ListApplicationsQuery) {
  const filter: Record<string, any> = { user: actor.id };
  if (query.status) filter.status = query.status;
  const [items, total] = await Promise.all([
    Application.find(filter)
      .sort({ updatedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('opportunity', 'title category organization deadline'),
    Application.countDocuments(filter),
  ]);
  return { items, pagination: paging(total, query.page, query.limit) };
}

export async function updateApplication(actor: Actor, id: string, input: { status?: string; notes?: string }) {
  if (!isValidObjectId(id)) throw appNotFound();
  // Matching on user too: you can only touch your own, anyone else's looks like "not found"
  const application = await Application.findOneAndUpdate({ _id: id, user: actor.id }, { $set: input }, { returnDocument: 'after' }).populate(
    'opportunity',
    'title category organization deadline'
  );
  if (!application) throw appNotFound();
  return application;
}

export async function removeApplication(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw appNotFound();
  const application = await Application.findOneAndDelete({ _id: id, user: actor.id });
  if (!application) throw appNotFound();
  await Opportunity.updateOne({ _id: application.opportunity }, { $inc: { applicationCount: -1 } });
}
