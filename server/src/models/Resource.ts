import { Schema, model } from 'mongoose';

export const RESOURCE_TYPES = ['LAB', 'SEMINAR_HALL', 'CLASSROOM', 'SPORTS', 'EQUIPMENT'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export interface IResource {
  name: string;
  type: ResourceType;
  location?: string;
  capacity?: number;
  description?: string;
  isActive: boolean;
}

const resourceSchema = new Schema<IResource>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: RESOURCE_TYPES, required: true },
    location: { type: String, trim: true },
    capacity: { type: Number, min: 1 },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

resourceSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
resourceSchema.index({ type: 1, isActive: 1 });

export const Resource = model<IResource>('Resource', resourceSchema);
