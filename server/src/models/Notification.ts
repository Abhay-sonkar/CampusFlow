import { Schema, Types, model } from 'mongoose';

export const NOTIFICATION_TYPES = ['NOTICE', 'COMPLAINT', 'BOOKING', 'OPPORTUNITY', 'DEADLINE'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification {
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string; // where the app should take the user when they click it
  readAt?: Date | null;
  // Same dedupeKey for the same user = the same notification. Makes retried jobs harmless.
  dedupeKey?: string;
}

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true },
    link: String,
    readAt: { type: Date, default: null },
    dedupeKey: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The inbox query: my notifications, unread first or newest first
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
// "Never create the same notification twice for one person", enforced by the database
notificationSchema.index(
  { user: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);
// MongoDB deletes notifications by itself after 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const Notification = model<INotification>('Notification', notificationSchema);
