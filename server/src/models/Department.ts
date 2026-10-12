import { Schema, model } from 'mongoose';

export interface IDepartment {
  name: string;
  description?: string;
  isActive: boolean;
}

const departmentSchema = new Schema<IDepartment>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique, and case-insensitive: "IT Support" and "it support" count as the same name
departmentSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Department = model<IDepartment>('Department', departmentSchema);
