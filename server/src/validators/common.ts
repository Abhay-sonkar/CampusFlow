import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// A timezone is mandatory ("Z" or "+05:30") so a time can never be read two ways
export const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'Use an ISO date-time with a timezone, e.g. 2026-10-20T10:00:00Z' })
  .transform((s) => new Date(s));

export const branchName = z.string().trim().min(1).max(20).transform((s) => s.toUpperCase());

// Lower case, trimmed, no duplicates
export const skillList = z
  .array(z.string().trim().min(1).max(40).transform((s) => s.toLowerCase()))
  .max(30)
  .transform((list) => [...new Set(list)]);

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
};
