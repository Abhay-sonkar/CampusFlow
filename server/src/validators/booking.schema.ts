import { z } from 'zod';
import { BOOKING_STATUSES } from '../models/Booking';
import { MAX_BOOKING_HOURS, SLOT_MS } from '../utils/slots';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// A timezone is mandatory ("Z" or "+05:30") so a time can never be read two ways
const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'Use an ISO date-time with a timezone, e.g. 2026-10-20T10:00:00Z' })
  .transform((s) => new Date(s));

export const createBookingSchema = z
  .object({
    resource: objectId,
    start: isoDateTime,
    end: isoDateTime,
    purpose: z.string().trim().min(3).max(300),
  })
  .superRefine((value, ctx) => {
    // If a date failed to parse, its own error is already reported
    if (!(value.start instanceof Date) || !(value.end instanceof Date)) return;
    const start = value.start.getTime();
    const end = value.end.getTime();
    if (end <= start) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'End must be after start' });
      return;
    }
    if (start % SLOT_MS !== 0 || end % SLOT_MS !== 0) {
      ctx.addIssue({ code: 'custom', path: ['start'], message: 'Times must be on 30-minute marks (10:00, 10:30, ...)' });
    }
    if (end - start > MAX_BOOKING_HOURS * 60 * 60 * 1000) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: `A booking can be at most ${MAX_BOOKING_HOURS} hours` });
    }
  });

export const rejectSchema = z.object({
  note: z.string().trim().min(3).max(500),
});

export const availabilityQuery = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

export const listBookingsQuery = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  resource: objectId.optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuery>;
