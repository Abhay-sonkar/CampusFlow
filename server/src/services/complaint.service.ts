import fs from 'fs/promises';
import { isValidObjectId } from 'mongoose';
import path from 'path';
import { Complaint, ComplaintStatus } from '../models/Complaint';
import { Department } from '../models/Department';
import { Role, User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { CreateComplaintInput, ListComplaintsQuery } from '../validators/complaint.schema';

export type Actor = { id: string; role: Role };
type Who = 'ADMIN' | 'ASSIGNEE' | 'CREATOR';

const notFound = () => new ApiError(404, 'Complaint not found');
const STAFF_ROLES: Role[] = ['FACULTY', 'CLUB_ADMIN', 'COLLEGE_ADMIN'];
const MAX_EVIDENCE = 10;

/*
 * THE WORKFLOW (a small state machine).
 * Each row says: a complaint in `from` may move to `to`, and only if the
 * person doing it is one of the `who` roles *for that specific complaint*.
 * Anything not listed here is impossible, so illegal jumps are rejected.
 */
const RULES: { from: ComplaintStatus; to: ComplaintStatus; who: Who[] }[] = [
  { from: 'OPEN', to: 'ASSIGNED', who: ['ADMIN'] },
  { from: 'ASSIGNED', to: 'ASSIGNED', who: ['ADMIN'] }, // re-assign to someone else
  { from: 'ASSIGNED', to: 'IN_PROGRESS', who: ['ASSIGNEE', 'ADMIN'] },
  { from: 'IN_PROGRESS', to: 'RESOLVED', who: ['ASSIGNEE', 'ADMIN'] },
  { from: 'RESOLVED', to: 'CLOSED', who: ['CREATOR'] }, // student confirms the fix
  { from: 'RESOLVED', to: 'IN_PROGRESS', who: ['CREATOR'] }, // student says "not fixed"
];

// Who may see a complaint: admins see all; everyone else only ones they filed
// or are assigned to. Used on every read, so one place decides visibility.
function visibility(actor: Actor): Record<string, any> {
  if (actor.role === 'COLLEGE_ADMIN') return {};
  return { $or: [{ createdBy: actor.id }, { assignedTo: actor.id }] };
}

const withDetails = (query: any) =>
  query
    .populate('department', 'name')
    .populate('createdBy', 'name email role branch year')
    .populate('assignedTo', 'name role')
    .populate('comments.author', 'name role')
    .populate('history.by', 'name role');

async function loadVisible(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw notFound();
  const complaint = await Complaint.findOne({ _id: id, ...visibility(actor) });
  if (!complaint) throw notFound(); // not allowed to see it = same answer as "doesn't exist"
  return complaint;
}

export async function getComplaint(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw notFound();
  const complaint = await withDetails(Complaint.findOne({ _id: id, ...visibility(actor) }));
  if (!complaint) throw notFound();
  return complaint;
}

export async function listComplaints(actor: Actor, query: ListComplaintsQuery) {
  const filter: Record<string, any> = { ...visibility(actor) };
  if (query.status) filter.status = query.status;
  if (query.department) filter.department = query.department;
  if (query.priority) filter.priority = query.priority;

  const [items, total] = await Promise.all([
    Complaint.find(filter)
      .select('-comments -history') // keep list responses light
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('department', 'name')
      .populate('createdBy', 'name')
      .populate('assignedTo', 'name'),
    Complaint.countDocuments(filter),
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}

export async function createComplaint(actor: Actor, input: CreateComplaintInput) {
  const department = await Department.findOne({ _id: input.department, isActive: true });
  if (!department) throw new ApiError(400, 'Unknown or inactive department');

  const complaint = await Complaint.create({
    ...input,
    createdBy: actor.id,
    history: [{ from: null, to: 'OPEN', by: actor.id }],
  });
  return getComplaint(actor, complaint.id);
}

/*
 * The one function that changes a complaint's status.
 * 1. Is this move in RULES?   2. Is this person allowed to make it?
 * 3. Apply it with a *conditional* update: "only if status is still `from`".
 *    If two people act at the same moment, only one wins; the other gets a 409
 *    instead of silently overwriting the first change.
 */
async function moveTo(
  actor: Actor,
  complaint: { _id: unknown; status: ComplaintStatus; assignedTo?: unknown; createdBy: unknown },
  to: ComplaintStatus,
  options: { note?: string; set?: Record<string, unknown> } = {}
) {
  const from = complaint.status;
  const rule = RULES.find((r) => r.from === from && r.to === to);
  if (!rule) throw new ApiError(409, `A ${from} complaint cannot be moved to ${to}`);

  const roles = new Set<Who>();
  if (actor.role === 'COLLEGE_ADMIN') roles.add('ADMIN');
  if (String(complaint.assignedTo) === actor.id) roles.add('ASSIGNEE');
  if (String(complaint.createdBy) === actor.id) roles.add('CREATOR');
  if (!rule.who.some((w) => roles.has(w))) throw new ApiError(403, 'You are not allowed to make this change');

  const now = new Date();
  const update: Record<string, any> = {
    $set: { status: to, ...options.set },
    $push: { history: { from, to, by: actor.id, note: options.note, at: now } },
  };
  if (to === 'RESOLVED') update.$set.resolvedAt = now;
  if (to === 'CLOSED') update.$set.closedAt = now;
  if (from === 'RESOLVED' && to === 'IN_PROGRESS') update.$unset = { resolvedAt: 1 }; // reopened

  const updated = await Complaint.findOneAndUpdate({ _id: complaint._id, status: from }, update, { new: true });
  if (!updated) throw new ApiError(409, 'This complaint was just updated by someone else. Reload and try again.');
}

export async function assignComplaint(actor: Actor, id: string, assigneeId: string, note?: string) {
  const complaint = await loadVisible(actor, id);
  const assignee = await User.findById(assigneeId).select('role');
  if (!assignee || !STAFF_ROLES.includes(assignee.role)) {
    throw new ApiError(400, 'The assignee must be a staff member (FACULTY, CLUB_ADMIN or COLLEGE_ADMIN)');
  }
  await moveTo(actor, complaint, 'ASSIGNED', { note, set: { assignedTo: assigneeId } });
  return getComplaint(actor, id);
}

export async function changeStatus(actor: Actor, id: string, to: ComplaintStatus, note?: string) {
  const complaint = await loadVisible(actor, id);
  await moveTo(actor, complaint, to, { note });
  return getComplaint(actor, id);
}

export async function confirmResolution(actor: Actor, id: string) {
  const complaint = await loadVisible(actor, id);
  await moveTo(actor, complaint, 'CLOSED', { note: 'Confirmed by the student' });
  return getComplaint(actor, id);
}

export async function reopenComplaint(actor: Actor, id: string, note: string) {
  const complaint = await loadVisible(actor, id);
  await moveTo(actor, complaint, 'IN_PROGRESS', { note });
  return getComplaint(actor, id);
}

export async function addComment(actor: Actor, id: string, text: string) {
  const complaint = await loadVisible(actor, id);
  if (complaint.status === 'CLOSED') throw new ApiError(409, 'This complaint is closed');
  await Complaint.updateOne({ _id: complaint._id }, { $push: { comments: { author: actor.id, text } } });
  return getComplaint(actor, id);
}

export async function removeFile(urlPath: string) {
  try {
    await fs.unlink(path.join(process.cwd(), urlPath));
  } catch {
    // Already gone: nothing to clean up
  }
}

export async function addEvidence(actor: Actor, id: string, files: { filename: string; originalname: string }[]) {
  const complaint = await loadVisible(actor, id);
  if (complaint.status === 'CLOSED') throw new ApiError(409, 'This complaint is closed');
  if (complaint.evidence.length + files.length > MAX_EVIDENCE) {
    throw new ApiError(400, `A complaint can have at most ${MAX_EVIDENCE} attachments`);
  }
  const entries = files.map((f) => ({ url: `/uploads/complaints/${f.filename}`, name: f.originalname }));
  await Complaint.updateOne({ _id: complaint._id }, { $push: { evidence: { $each: entries } } });
  return getComplaint(actor, id);
}
