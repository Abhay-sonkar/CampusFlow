import { Bookmark } from '../models/Bookmark';
import { Application } from '../models/Application';
import { Booking } from '../models/Booking';
import { Complaint } from '../models/Complaint';
import { Notice } from '../models/Notice';
import { Opportunity } from '../models/Opportunity';
import { User } from '../models/User';
import { sendEmail } from '../services/email.service';
import { notifyUsers } from '../services/notification.service';
import { JobData, JobName } from './types';
import '../models/Resource'; // registers the model, so populate('resource') works inside the worker

/*
 * The work done by the worker. One small function per kind of job.
 * RULE: every handler must be safe to run twice. Queues deliver "at least once": if a worker
 * crashes after doing the work but before reporting success, the job runs again.
 * Here that is handled with dedupeKey, so a repeat creates no second notification.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LABELS: Record<string, string> = {
  INTERNSHIP: 'internship',
  HACKATHON: 'hackathon',
  SCHOLARSHIP: 'scholarship',
  CONTEST: 'contest',
  WORKSHOP: 'workshop',
  EVENT: 'event',
};
const when = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const preview = (text: string) => (text.length > 120 ? `${text.slice(0, 117)}...` : text);
// Case-insensitive matching, so "cse" in a profile matches "CSE" in a notice
const ci = { locale: 'en', strength: 2 } as const;

// Everyone a notice is aimed at (empty list = everyone), except its author
async function audienceUserIds(audience: { roles: string[]; branches: string[]; years: number[] }, exclude?: unknown) {
  const filter: Record<string, any> = {};
  if (exclude) filter._id = { $ne: exclude };
  if (audience.roles.length) filter.role = { $in: audience.roles };
  if (audience.branches.length) filter.branch = { $in: audience.branches };
  if (audience.years.length) filter.year = { $in: audience.years };
  const users = await User.find(filter).collation(ci).select('_id');
  return users.map((u) => u.id);
}

async function noticePublished({ noticeId }: JobData['notice.published']) {
  const notice = await Notice.findById(noticeId);
  if (!notice || notice.status !== 'PUBLISHED') return; // unpublished or deleted while the job waited
  const recipients = await audienceUserIds(notice.audience, notice.createdBy);
  await notifyUsers(recipients, {
    type: 'NOTICE',
    title: `New notice: ${notice.title}`,
    body: preview(notice.content),
    link: `/notices/${notice.id}`,
    dedupeKey: `notice:${notice.id}`,
    email: notice.isPinned, // only pinned (important) notices also go out by email
  });
}

async function complaintUpdated({ complaintId, actorId, status }: JobData['complaint.updated']) {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) return;
  const creator = String(complaint.createdBy);
  const assignee = complaint.assignedTo ? String(complaint.assignedTo) : null;
  const lastNote = complaint.history[complaint.history.length - 1]?.note;
  // One number per status change, so a complaint that is reopened later still notifies again
  const step = complaint.history.length;

  // Whoever made the change already knows about it, so they are never notified
  const tell = async (userId: string | null, title: string, body: string, email = false) => {
    if (!userId || userId === actorId) return;
    await notifyUsers([userId], {
      type: 'COMPLAINT',
      title,
      body,
      link: `/complaints/${complaint.id}`,
      dedupeKey: `complaint:${complaint.id}:${step}`,
      email,
    });
  };

  switch (status) {
    case 'ASSIGNED':
      await tell(creator, `Your complaint was assigned: ${complaint.title}`, 'A staff member is now responsible for it.');
      await tell(assignee, `New complaint assigned to you: ${complaint.title}`, preview(complaint.description));
      break;
    case 'IN_PROGRESS':
      await tell(creator, `Work has started on your complaint: ${complaint.title}`, lastNote ?? 'Someone is working on it.');
      await tell(assignee, `Complaint reopened: ${complaint.title}`, lastNote ?? 'The student says it is not fixed yet.');
      break;
    case 'RESOLVED':
      await tell(creator, `Your complaint was resolved: ${complaint.title}`, 'Please confirm it is fixed, or reopen it.', true);
      break;
    case 'CLOSED':
      await tell(assignee, `Complaint closed: ${complaint.title}`, 'The student confirmed the fix.');
      break;
  }
}

async function bookingDecided({ bookingId }: JobData['booking.decided']) {
  const booking = await Booking.findById(bookingId).populate('resource', 'name');
  if (!booking || (booking.status !== 'APPROVED' && booking.status !== 'REJECTED')) return;
  if (String(booking.decidedBy) === String(booking.bookedBy)) return; // approved their own request
  const approved = booking.status === 'APPROVED';
  const name = (booking.resource as any)?.name ?? 'resource';
  await notifyUsers([booking.bookedBy], {
    type: 'BOOKING',
    title: `Booking ${approved ? 'approved' : 'rejected'}: ${name}`,
    body: `${when(booking.start)} to ${when(booking.end)}${booking.decisionNote ? `. Reason: ${booking.decisionNote}` : ''}`,
    link: `/bookings/${booking.id}`,
    dedupeKey: `booking:${booking.id}:${booking.status}`,
    email: true,
  });
}

async function opportunityCreated({ opportunityId }: JobData['opportunity.created']) {
  const opp = await Opportunity.findById(opportunityId);
  if (!opp || !opp.isActive) return;
  // Students the posting is open to (an empty list means "open to all")
  const filter: Record<string, any> = { role: 'STUDENT', _id: { $ne: opp.createdBy } };
  if (opp.eligibility.branches.length) filter.branch = { $in: opp.eligibility.branches };
  if (opp.eligibility.years.length) filter.year = { $in: opp.eligibility.years };
  const students = await User.find(filter).collation(ci).select('_id');
  await notifyUsers(students.map((s) => s.id), {
    type: 'OPPORTUNITY',
    title: `New ${LABELS[opp.category] ?? 'opportunity'}: ${opp.title}`,
    body: `${opp.organization}. Deadline: ${when(opp.deadline)}`,
    link: `/opportunities/${opp.id}`,
    dedupeKey: `opp:${opp.id}:new`,
  });
}

// Runs every hour (scheduled by the worker): reminds people about deadlines in the next 24 hours
async function deadlinesScan() {
  const now = new Date();
  const soon = new Date(now.getTime() + DAY_MS);

  const opportunities = await Opportunity.find({ isActive: true, deadline: { $gt: now, $lte: soon } }).limit(500);
  for (const opp of opportunities) {
    // Remind people who saved it but have not applied yet
    const [saved, applied] = await Promise.all([
      Bookmark.distinct('user', { opportunity: opp._id }),
      Application.distinct('user', { opportunity: opp._id }),
    ]);
    const done = new Set(applied.map(String));
    await notifyUsers(saved.filter((u) => !done.has(String(u))), {
      type: 'DEADLINE',
      title: `Closing within 24 hours: ${opp.title}`,
      body: `Deadline: ${when(opp.deadline)}`,
      link: `/opportunities/${opp.id}`,
      dedupeKey: `deadline:opp:${opp.id}`, // the hourly scan sees it up to 24 times; this keeps it to one reminder
      email: true,
    });
  }

  const notices = await Notice.find({ status: 'PUBLISHED', deadline: { $gt: now, $lte: soon } }).limit(500);
  for (const notice of notices) {
    await notifyUsers(await audienceUserIds(notice.audience), {
      type: 'DEADLINE',
      title: `Deadline soon: ${notice.title}`,
      body: `Deadline: ${when(notice.deadline as Date)}`,
      link: `/notices/${notice.id}`,
      dedupeKey: `deadline:notice:${notice.id}`,
    });
  }
  console.log(`[deadlines.scan] checked ${opportunities.length} opportunities and ${notices.length} notices`);
}

async function emailSend(data: JobData['email.send']) {
  await sendEmail(data);
}

export const handlers: { [N in JobName]: (data: JobData[N]) => Promise<void> } = {
  'notice.published': noticePublished,
  'complaint.updated': complaintUpdated,
  'booking.decided': bookingDecided,
  'opportunity.created': opportunityCreated,
  'deadlines.scan': deadlinesScan,
  'email.send': emailSend,
};

export async function processJob(name: string, data: unknown) {
  const handler = (handlers as Record<string, (d: any) => Promise<void>>)[name];
  if (!handler) throw new Error(`No handler for job "${name}"`);
  await handler(data);
}
