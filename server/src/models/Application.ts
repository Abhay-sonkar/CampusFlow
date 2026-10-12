import { Schema, Types, model } from 'mongoose';

// The student tracks their own progress; these are not set by the organisation.
export const APPLICATION_STATUSES = ['APPLIED', 'SHORTLISTED', 'SELECTED', 'REJECTED', 'WITHDRAWN'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface IApplication {
  user: Types.ObjectId;
  opportunity: Types.ObjectId;
  status: ApplicationStatus;
  notes?: string;
  appliedAt: Date;
}

const applicationSchema = new Schema<IApplication>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    opportunity: { type: Schema.Types.ObjectId, ref: 'Opportunity', required: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'APPLIED' },
    notes: { type: String, trim: true },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

applicationSchema.index({ user: 1, opportunity: 1 }, { unique: true });
applicationSchema.index({ user: 1, status: 1, updatedAt: -1 });

export const Application = model<IApplication>('Application', applicationSchema);
