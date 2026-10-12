import { z } from 'zod';
import { RESOURCE_TYPES } from '../models/Resource';

export const createResourceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(RESOURCE_TYPES),
  location: z.string().trim().max(100).optional(),
  capacity: z.number().int().min(1).max(5000).optional(),
  description: z.string().trim().max(300).optional(),
});

export const updateResourceSchema = createResourceSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });

export const listResourcesQuery = z.object({
  type: z.enum(RESOURCE_TYPES).optional(),
  q: z.string().trim().min(1).optional(),
  includeInactive: z.enum(['true']).optional(), // honoured for COLLEGE_ADMIN only
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ListResourcesQuery = z.infer<typeof listResourcesQuery>;
