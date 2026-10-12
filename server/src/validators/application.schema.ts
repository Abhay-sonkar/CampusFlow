import { z } from 'zod';
import { APPLICATION_STATUSES } from '../models/Application';
import { pagination } from './common';

// The body is optional, so a client may send nothing at all
export const applySchema = z.object({ notes: z.string().trim().max(500).optional() }).optional();

export const updateApplicationSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });

export const listApplicationsQuery = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  ...pagination,
});

export const listBookmarksQuery = z.object({ ...pagination });

export type ListApplicationsQuery = z.infer<typeof listApplicationsQuery>;
export type ListBookmarksQuery = z.infer<typeof listBookmarksQuery>;
