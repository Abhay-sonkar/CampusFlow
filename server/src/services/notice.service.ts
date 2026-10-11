import fs from 'fs/promises';
import { isValidObjectId } from 'mongoose';
import path from 'path';
import { Notice } from '../models/Notice';
import { Role, User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { CreateNoticeInput, ListNoticesQuery, UpdateNoticeInput } from '../validators/notice.schema';

export type Actor = { id: string; role: Role };

const notFound = () => new ApiError(404, 'Notice not found');

// Mongo filter: "notices this person is part of the audience for".
// An empty audience array means everyone.
function audienceFilter(viewer: { role: Role; branch?: string; year?: number }) {
  const everyoneOr = (field: string, value: unknown) => ({
    $or: [{ [field]: { $size: 0 } }, { [field]: value }],
  });
  return {
    $and: [
      everyoneOr('audience.roles', viewer.role),
      viewer.branch
        ? everyoneOr('audience.branches', viewer.branch.toUpperCase())
        : { 'audience.branches': { $size: 0 } },
      viewer.year ? everyoneOr('audience.years', viewer.year) : { 'audience.years': { $size: 0 } },
    ],
  };
}

async function getViewer(actor: Actor) {
  const viewer = await User.findById(actor.id).select('role branch year');
  if (!viewer) throw new ApiError(401, 'User no longer exists');
  return viewer;
}

// Loads a notice only if the actor may modify it (owner, or COLLEGE_ADMIN)
async function loadManageable(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw notFound();
  const notice = await Notice.findById(id);
  if (!notice) throw notFound();
  const isOwner = notice.createdBy.toString() === actor.id;
  if (!isOwner && actor.role !== 'COLLEGE_ADMIN') {
    throw new ApiError(403, 'You can only manage your own notices');
  }
  return notice;
}

async function paginate(filter: Record<string, any>, sort: Record<string, 1 | -1>, page: number, limit: number) {
  const [items, total] = await Promise.all([
    Notice.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name role'),
    Notice.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

// Personalised feed: published + targeted at me. Pinned first, then newest.
export async function listFeed(actor: Actor, query: ListNoticesQuery) {
  const viewer = await getViewer(actor);
  const filter: Record<string, any> = { status: 'PUBLISHED', ...audienceFilter(viewer) };
  if (query.q) filter.$text = { $search: query.q };
  if (query.category) filter.category = query.category;
  if (query.pinned) filter.isPinned = query.pinned === 'true';
  if (query.upcoming) filter.deadline = { $gte: new Date() };
  return paginate(filter, { isPinned: -1, publishedAt: -1 }, query.page, query.limit);
}

// Author view: my notices (any status). COLLEGE_ADMIN sees everyone's.
export async function listManaged(actor: Actor, query: ListNoticesQuery) {
  const filter: Record<string, any> = actor.role === 'COLLEGE_ADMIN' ? {} : { createdBy: actor.id };
  if (query.q) filter.$text = { $search: query.q };
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  return paginate(filter, { createdAt: -1 }, query.page, query.limit);
}

export async function getNotice(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw notFound();
  const found = await Notice.findById(id);
  if (!found) throw notFound();

  const canManage = actor.role === 'COLLEGE_ADMIN' || found.createdBy.toString() === actor.id;
  if (canManage) return found.populate('createdBy', 'name role');

  // Everyone else: must be published AND meant for them. Otherwise pretend it doesn't exist.
  const viewer = await getViewer(actor);
  const visible = await Notice.findOne({ _id: id, status: 'PUBLISHED', ...audienceFilter(viewer) }).populate(
    'createdBy',
    'name role'
  );
  if (!visible) throw notFound();
  return visible;
}

export async function createNotice(actor: Actor, input: CreateNoticeInput) {
  if (input.isPinned && actor.role !== 'COLLEGE_ADMIN') {
    throw new ApiError(403, 'Only a COLLEGE_ADMIN can pin notices');
  }
  // Always starts as a DRAFT; publishing is a separate, deliberate step
  return Notice.create({ ...input, createdBy: actor.id });
}

export async function updateNotice(actor: Actor, id: string, input: UpdateNoticeInput) {
  const notice = await loadManageable(actor, id);
  if (input.isPinned !== undefined && actor.role !== 'COLLEGE_ADMIN') {
    throw new ApiError(403, 'Only a COLLEGE_ADMIN can pin or unpin notices');
  }
  const { audience, ...rest } = input;
  const set: Record<string, unknown> = { ...rest };
  // Dotted paths update only the audience fields that were sent
  if (audience) {
    for (const [key, value] of Object.entries(audience)) {
      if (value !== undefined) set[`audience.${key}`] = value;
    }
  }
  return Notice.findByIdAndUpdate(notice._id, { $set: set }, { new: true, runValidators: true });
}

export async function setPublished(actor: Actor, id: string, published: boolean) {
  const notice = await loadManageable(actor, id);
  notice.status = published ? 'PUBLISHED' : 'DRAFT';
  if (published && !notice.publishedAt) notice.publishedAt = new Date();
  await notice.save();
  return notice;
}

async function removeFile(urlPath?: string | null) {
  if (!urlPath) return;
  try {
    await fs.unlink(path.join(process.cwd(), urlPath));
  } catch {
    // File already gone: nothing to clean up
  }
}

export async function deleteNotice(actor: Actor, id: string) {
  const notice = await loadManageable(actor, id);
  await removeFile(notice.attachmentUrl);
  await notice.deleteOne();
}

export async function setAttachment(actor: Actor, id: string, file: { filename: string; originalname: string }) {
  const notice = await loadManageable(actor, id);
  await removeFile(notice.attachmentUrl); // replace any previous PDF
  notice.attachmentUrl = `/uploads/notices/${file.filename}`;
  notice.attachmentName = file.originalname;
  await notice.save();
  return notice;
}

export { removeFile };
