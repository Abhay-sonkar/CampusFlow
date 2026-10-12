import { z } from 'zod';
import { branchName, skillList } from './common';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    branch: branchName.optional(),
    year: z.number().int().min(1).max(5).optional(),
    skills: skillList.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
