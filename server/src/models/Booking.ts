import { Schema, Types, model } from 'mongoose';

export const BOOKING_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface IBooking {
  resource: Types.ObjectId;
  bookedBy: Types.ObjectId;
  purpose: string;
  start: Date;
  end: Date;
  status: BookingStatus;
  slots: number[]; // the 30-minute slots this booking covers
  holdsSlot: boolean; // true while PENDING or APPROVED; false once rejected or cancelled
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  decisionNote?: string;
  cancelledAt?: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    resource: { type: Schema.Types.ObjectId, ref: 'Resource', required: true },
    bookedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, required: true, trim: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    status: { type: String, enum: BOOKING_STATUSES, default: 'PENDING' },
    slots: { type: [Number], required: true },
    holdsSlot: { type: Boolean, default: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    decisionNote: String,
    cancelledAt: Date,
  },
  { timestamps: true }
);

/*
 * THE DOUBLE-BOOKING GUARD.
 * Unique on (resource, each slot), but only for bookings that still hold their slot.
 * If two requests try to claim the same slot of the same resource at the same instant,
 * MongoDB lets exactly one insert succeed and fails the other with error 11000.
 * The check happens inside the database, so it cannot be raced, even with many servers.
 */
bookingSchema.index({ resource: 1, slots: 1 }, { unique: true, partialFilterExpression: { holdsSlot: true } });
bookingSchema.index({ bookedBy: 1, start: -1 });
bookingSchema.index({ resource: 1, start: 1 });
bookingSchema.index({ status: 1, createdAt: 1 });

export const Booking = model<IBooking>('Booking', bookingSchema);
