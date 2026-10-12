import { Schema, Types, model } from 'mongoose';

export const COMPLAINT_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface IComplaint {
  title: string;
  description: string;
  department: Types.ObjectId;
  priority: Priority;
  status: ComplaintStatus;
  createdBy: Types.ObjectId;
  assignedTo?: Types.ObjectId | null;
  evidence: { url: string; name: string }[];
  comments: { author: Types.ObjectId; text: string; createdAt: Date }[];
  // Every status change is recorded here: a built-in audit trail
  history: { from: ComplaintStatus | null; to: ComplaintStatus; by: Types.ObjectId; note?: string; at: Date }[];
  resolvedAt?: Date;
  closedAt?: Date;
}

const complaintSchema = new Schema<IComplaint>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    priority: { type: String, enum: PRIORITIES, default: 'MEDIUM' },
    status: { type: String, enum: COMPLAINT_STATUSES, default: 'OPEN' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    evidence: { type: [{ _id: false, url: String, name: String }], default: [] },
    comments: {
      type: [
        {
          author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          text: { type: String, required: true, trim: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    history: {
      type: [
        {
          _id: false,
          from: { type: String, default: null },
          to: { type: String, required: true },
          by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          note: String,
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    resolvedAt: Date,
    closedAt: Date,
  },
  { timestamps: true }
);

complaintSchema.index({ createdBy: 1, createdAt: -1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
complaintSchema.index({ status: 1, department: 1, createdAt: -1 });

export const Complaint = model<IComplaint>('Complaint', complaintSchema);
