import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
});

export const updateDepartmentSchema = createDepartmentSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
