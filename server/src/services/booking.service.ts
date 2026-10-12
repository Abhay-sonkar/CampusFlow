import { isValidObjectId } from 'mongoose';
import { Booking } from '../models/Booking';
import { Resource } from '../models/Resource';
import { Role } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { MAX_DAYS_AHEAD, slotsFor } from '../utils/slots';
import { CreateBookingInput, ListBookingsQuery } from '../validators/booking.schema';

export type Actor = { id: string; role: Role };

const DAY_MS = 24 * 60 * 60 * 1000;
const notFound = () => new ApiError(404, 'Booking not found');
const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

const withDetails = (query: any) =>
  query
    .select('-slots') // internal bookkeeping, not useful to clients
    .populate('resource', 'name type location')
    .populate('bookedBy', 'name email role')
    .populate('decidedBy', 'name');

// Admins can open any booking; everyone else only their own (others get a plain 404)
const ownerFilter = (actor: Actor): Record<string, any> => (actor.role === 'COLLEGE_ADMIN' ? {} : { bookedBy: actor.id });

export async function getBooking(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw notFound();
  const booking = await withDetails(Booking.findOne({ _id: id, ...ownerFilter(actor) }));
  if (!booking) throw notFound();
  return booking;
}

export async function createBooking(actor: Actor, input: CreateBookingInput) {
  const now = Date.now();
  if (input.start.getTime() <= now) throw new ApiError(400, 'The start time must be in the future');
  if (input.start.getTime() > now + MAX_DAYS_AHEAD * DAY_MS) {
    throw new ApiError(400, `Bookings can be made at most ${MAX_DAYS_AHEAD} days ahead`);
  }

  const resource = await Resource.findById(input.resource);
  if (!resource) throw new ApiError(404, 'Resource not found');
  if (!resource.isActive) throw new ApiError(409, 'This resource is not available for booking');

  // Make sure the unique index exists before the first write (it is built in the background at startup)
  await Booking.init();

  try {
    const booking = await Booking.create({
      resource: resource._id,
      bookedBy: actor.id,
      purpose: input.purpose,
      start: input.start,
      end: input.end,
      slots: slotsFor(input.start, input.end),
      holdsSlot: true,
      status: 'PENDING',
    });
    return getBooking(actor, booking.id);
  } catch (err) {
    // The database refused it because another active booking already holds one of these slots
    if (isDuplicateKey(err)) {
      throw new ApiError(409, 'That time overlaps another booking or request for this resource');
    }
    throw err;
  }
}

async function paginate(filter: Record<string, any>, sort: Record<string, 1 | -1>, query: ListBookingsQuery) {
  const [items, total] = await Promise.all([
    withDetails(Booking.find(filter).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit)),
    Booking.countDocuments(filter),
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}

function buildFilter(base: Record<string, any>, query: ListBookingsQuery) {
  const filter = { ...base };
  if (query.status) filter.status = query.status;
  if (query.resource) filter.resource = query.resource;
  // "Overlaps the window": it starts before the window ends AND ends after the window starts
  if (query.from) filter.end = { $gt: query.from };
  if (query.to) filter.start = { $lt: query.to };
  return filter;
}

// My booking history, newest first
export function listMine(actor: Actor, query: ListBookingsQuery) {
  return paginate(buildFilter({ bookedBy: actor.id }, query), { start: -1 }, query);
}

// Admin view. For the approval queue (status=PENDING) the oldest request comes first.
export function listAll(query: ListBookingsQuery) {
  const sort: Record<string, 1 | -1> = { createdAt: query.status === 'PENDING' ? 1 : -1 };
  return paginate(buildFilter({}, query), sort, query);
}

export async function approveBooking(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw notFound();
  const booking = await Booking.findById(id);
  if (!booking) throw notFound();
  if (booking.start.getTime() <= Date.now()) throw new ApiError(409, 'The start time has already passed');

  // Conditional update: only succeeds if it is still PENDING right now
  const updated = await Booking.findOneAndUpdate(
    { _id: id, status: 'PENDING' },
    { $set: { status: 'APPROVED', decidedBy: actor.id, decidedAt: new Date() } },
    { new: true }
  );
  if (!updated) throw new ApiError(409, 'Only a pending booking can be approved');
  return getBooking(actor, id);
}

export async function rejectBooking(actor: Actor, id: string, note: string) {
  if (!isValidObjectId(id)) throw notFound();
  // holdsSlot: false frees the time for someone else, immediately
  const updated = await Booking.findOneAndUpdate(
    { _id: id, status: 'PENDING' },
    { $set: { status: 'REJECTED', holdsSlot: false, decisionNote: note, decidedBy: actor.id, decidedAt: new Date() } },
    { new: true }
  );
  if (!updated) {
    if (!(await Booking.exists({ _id: id }))) throw notFound();
    throw new ApiError(409, 'Only a pending booking can be rejected');
  }
  return getBooking(actor, id);
}

export async function cancelBooking(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw notFound();
  const booking = await Booking.findOne({ _id: id, ...ownerFilter(actor) });
  if (!booking) throw notFound();
  if (booking.end.getTime() <= Date.now()) throw new ApiError(409, 'This booking has already finished');

  const updated = await Booking.findOneAndUpdate(
    { _id: id, status: { $in: ['PENDING', 'APPROVED'] } },
    { $set: { status: 'CANCELLED', holdsSlot: false, cancelledAt: new Date() } },
    { new: true }
  );
  if (!updated) throw new ApiError(409, 'This booking can no longer be cancelled');
  return getBooking(actor, id);
}

// Which times are taken? Shows only start/end/status, never who booked or why.
export async function getAvailability(resourceId: string, from?: Date, to?: Date) {
  if (!isValidObjectId(resourceId)) throw new ApiError(404, 'Resource not found');
  const resource = await Resource.findById(resourceId).select('name type isActive');
  if (!resource) throw new ApiError(404, 'Resource not found');

  const windowStart = from ?? new Date();
  const windowEnd = to ?? new Date(windowStart.getTime() + 7 * DAY_MS);
  if (windowEnd <= windowStart) throw new ApiError(400, '"to" must be after "from"');
  if (windowEnd.getTime() - windowStart.getTime() > 31 * DAY_MS) throw new ApiError(400, 'Choose a window of 31 days or less');

  const bookings = await Booking.find({
    resource: resource._id,
    holdsSlot: true,
    start: { $lt: windowEnd },
    end: { $gt: windowStart },
  })
    .sort({ start: 1 })
    .select('start end status');

  return {
    resource: { id: resource._id, name: resource.name, type: resource.type, isActive: resource.isActive },
    from: windowStart,
    to: windowEnd,
    isFree: bookings.length === 0,
    bookings,
  };
}
