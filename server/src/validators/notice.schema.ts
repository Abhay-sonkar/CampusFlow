import { z } from 'zod';
import { CATEGORIES, NOTICE_STATUSES } from '../models/Notice';
import { ROLES } from '../models/User';

const audienceSchema = z.object({
  roles: z.array(z.enum(ROLES)).max(4).optional(),
  // Branches are stored in upper case so "cse" and "CSE" match
  branches: z.array(z.string().trim().min(1).transform((s) => s.toUpperCase())).max(20).optional(),
  years: z.array(z.number().int().min(1).max(5)).max(5).optional(),
});

// No .default() here on purpose: the update schema reuses this, and
// defaults would silently overwrite fields the client did not send.
export const createNoticeSchema = z.object({
  title: z.string().trim().min(3).max(150),
  content: z.string().trim().min(1).max(5000),
  category: z.enum(CATEGORIES).optional(),
  deadline: z.coerce.date().nullable().optional(),
  isPinned: z.boolean().optional(),
  audience: audienceSchema.optional(),
});

export const updateNoticeSchema = createNoticeSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });

export const listNoticesQuery = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(NOTICE_STATUSES).optional(), // used by /manage only
  pinned: z.enum(['true', 'false']).optional(),
  upcoming: z.enum(['true']).optional(), // only notices whose deadline is still ahead
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>;
export type ListNoticesQuery = z.infer<typeof listNoticesQuery>;
