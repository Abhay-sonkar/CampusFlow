import { Schema, Types, model } from 'mongoose';
import { ROLES, Role } from './User';

export const CATEGORIES = ['GENERAL', 'ACADEMIC', 'EXAM', 'PLACEMENT', 'EVENT', 'HOSTEL'] as const;
export type Category = (typeof CATEGORIES)[number];

export const NOTICE_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

export interface INotice {
  title: string;
  content: string;
  category: Category;
  status: NoticeStatus;
  isPinned: boolean;
  deadline?: Date | null;
  publishedAt?: Date;
  // An empty array means "everyone" for that field
  audience: { roles: Role[]; branches: string[]; years: number[] };
  attachmentUrl?: string;
  attachmentName?: string;
  createdBy: Types.ObjectId;
}

const noticeSchema = new Schema<INotice>(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    category: { type: String, enum: CATEGORIES, default: 'GENERAL' },
    status: { type: String, enum: NOTICE_STATUSES, default: 'DRAFT' },
    isPinned: { type: Boolean, default: false },
    deadline: { type: Date, default: null },
    publishedAt: Date,
    audience: {
      roles: { type: [{ type: String, enum: ROLES }], default: [] },
      branches: { type: [String], default: [] },
      years: { type: [Number], default: [] },
    },
    attachmentUrl: String,
    attachmentName: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Indexes match the queries we run (this is what keeps the feed fast)
noticeSchema.index({ status: 1, isPinned: -1, publishedAt: -1 });
noticeSchema.index({ createdBy: 1, createdAt: -1 });
noticeSchema.index({ title: 'text', content: 'text' });

export const Notice = model<INotice>('Notice', noticeSchema);
