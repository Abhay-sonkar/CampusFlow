import { isValidObjectId } from 'mongoose';
import { enqueueJob } from '../jobs/enqueue';
import { Notification, NotificationType } from '../models/Notification';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';

export interface NotifySpec {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
  email?: boolean; // also send an email
}

// With ordered:false MongoDB inserts everything it can and reports the rejected duplicates; those are fine
function isDuplicateOnly(err: any) {
  const failures = err?.writeErrors ?? [];
  if (failures.length > 0) return failures.every((e: any) => (e.code ?? e.err?.code) === 11000);
  return err?.code === 11000;
}

/*
 * Creates one notification per user (and optionally one email job per user).
 * Safe to run twice for the same event: the dedupeKey makes the second run create nothing.
 */
export async function notifyUsers(userIds: unknown[], spec: NotifySpec) {
  const ids = [...new Set(userIds.map(String))];
  if (ids.length === 0) return 0;

  await Notification.init(); // the unique index must exist for the duplicate protection to work

  // Insert in chunks of 500 so one big audience never becomes one giant database call
  for (let i = 0; i < ids.length; i += 500) {
    const docs = ids.slice(i, i + 500).map((user) => ({
      user,
      type: spec.type,
      title: spec.title,
      body: spec.body,
      link: spec.link,
      dedupeKey: spec.dedupeKey,
    }));
    try {
      await Notification.insertMany(docs, { ordered: false });
    } catch (err) {
      if (!isDuplicateOnly(err)) throw err;
    }
  }

  if (spec.email) {
    const users = await User.find({ _id: { $in: ids } }).select('email');
    for (const user of users) {
      // Job ids may not contain ":"; the id also stops the same email being queued twice
      const jobId = spec.dedupeKey ? `email-${spec.dedupeKey.replace(/:/g, '-')}-${user.id}` : undefined;
      await enqueueJob(
        'email.send',
        {
          to: user.email,
          subject: spec.title,
          text: `${spec.title}\n\n${spec.body ?? ''}\n\nOpen CampusFlow to see the details.`,
        },
        jobId ? { jobId } : undefined
      );
    }
  }
  return ids.length;
}

// ---------- what the notification bell needs ----------

export const unreadCount = (userId: string) => Notification.countDocuments({ user: userId, readAt: null });

export async function listForUser(userId: string, query: { unread?: 'true'; page: number; limit: number }) {
  const filter: Record<string, any> = { user: userId };
  if (query.unread) filter.readAt = null;
  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Notification.countDocuments(filter),
    unreadCount(userId),
  ]);
  return { items, unread, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}

export async function markRead(userId: string, id: string) {
  if (!isValidObjectId(id)) throw new ApiError(404, 'Notification not found');
  // readAt: null in the filter means an already-read notification keeps its original read time
  await Notification.updateOne({ _id: id, user: userId, readAt: null }, { $set: { readAt: new Date() } });
  const notification = await Notification.findOne({ _id: id, user: userId });
  if (!notification) throw new ApiError(404, 'Notification not found');
  return notification;
}

export async function markAllRead(userId: string) {
  const result = await Notification.updateMany({ user: userId, readAt: null }, { $set: { readAt: new Date() } });
  return result.modifiedCount;
}
