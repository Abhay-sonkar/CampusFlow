import { z } from 'zod';
import { COMPLAINT_STATUSES, PRIORITIES } from '../models/Complaint';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createComplaintSchema = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(10).max(2000),
  department: objectId,
  priority: z.enum(PRIORITIES).optional(),
});

export const assignSchema = z.object({
  assigneeId: objectId,
  note: z.string().trim().max(500).optional(),
});

// Staff can only move a complaint forward to these two states
export const statusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'RESOLVED']),
  note: z.string().trim().max(500).optional(),
});

// Rejecting a "resolved" complaint needs a reason
export const reopenSchema = z.object({
  note: z.string().trim().min(5).max(500),
});

export const commentSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

export const listComplaintsQuery = z.object({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  department: objectId.optional(),
  priority: z.enum(PRIORITIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;
export type ListComplaintsQuery = z.infer<typeof listComplaintsQuery>;
