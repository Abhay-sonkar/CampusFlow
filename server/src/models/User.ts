import bcrypt from 'bcrypt';
import { Schema, model } from 'mongoose';

export const ROLES = ['STUDENT', 'FACULTY', 'CLUB_ADMIN', 'COLLEGE_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export interface IUser {
  name: string;
  email: string;
  password: string;
  role: Role;
  branch?: string;
  year?: number;
  skills: string[];
  isEmailVerified: boolean;
  refreshTokenHash?: string;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'STUDENT' },
    branch: String,
    year: { type: Number, min: 1, max: 5 },
    skills: { type: [String], default: [] },
    isEmailVerified: { type: Boolean, default: false },
    // Hash of the user's current refresh token (never the token itself)
    refreshTokenHash: { type: String, select: false },
  },
  { timestamps: true }
);

// Hash the password whenever it is set or changed
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

export const User = model<IUser>('User', userSchema);
