import { Schema, Types, model } from 'mongoose';

export const OPPORTUNITY_CATEGORIES = ['INTERNSHIP', 'HACKATHON', 'SCHOLARSHIP', 'CONTEST', 'WORKSHOP', 'EVENT'] as const;
export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];

export interface IOpportunity {
  title: string;
  description: string;
  category: OpportunityCategory;
  organization: string;
  location?: string;
  applyUrl?: string;
  deadline: Date;
  // Who may apply. An empty list means "everyone" for that field.
  eligibility: { branches: string[]; years: number[] };
  skills: string[]; // lower case tags, used for filtering and recommendations
  isActive: boolean;
  createdBy: Types.ObjectId;
  // Counters kept in step with the bookmark/application collections (cheap popularity data)
  bookmarkCount: number;
  applicationCount: number;
}

const opportunitySchema = new Schema<IOpportunity>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, enum: OPPORTUNITY_CATEGORIES, required: true },
    organization: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    applyUrl: { type: String, trim: true },
    deadline: { type: Date, required: true },
    eligibility: {
      branches: { type: [String], default: [] },
      years: { type: [Number], default: [] },
    },
    skills: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bookmarkCount: { type: Number, default: 0, min: 0 },
    applicationCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

opportunitySchema.index({ isActive: 1, deadline: 1 });
opportunitySchema.index({ category: 1, deadline: 1 });
opportunitySchema.index({ createdBy: 1, createdAt: -1 });
opportunitySchema.index(
  { title: 'text', description: 'text', organization: 'text', skills: 'text' },
  { weights: { title: 5, skills: 3, organization: 2, description: 1 } }
);

export const Opportunity = model<IOpportunity>('Opportunity', opportunitySchema);
