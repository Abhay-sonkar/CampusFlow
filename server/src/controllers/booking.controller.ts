import { Request, Response } from 'express';
import * as bookingService from '../services/booking.service';
import { listBookingsQuery } from '../validators/booking.schema';

const actor = (req: Request) => req.user!;
const idOf = (req: Request) => String(req.params.id);

export async function create(req: Request, res: Response) {
  res.status(201).json({ success: true, booking: await bookingService.createBooking(actor(req), req.body) });
}

export async function listMine(req: Request, res: Response) {
  const query = listBookingsQuery.parse(req.query);
  res.json({ success: true, ...(await bookingService.listMine(actor(req), query)) });
}

export async function listAll(req: Request, res: Response) {
  const query = listBookingsQuery.parse(req.query);
  res.json({ success: true, ...(await bookingService.listAll(query)) });
}

export async function getOne(req: Request, res: Response) {
  res.json({ success: true, booking: await bookingService.getBooking(actor(req), idOf(req)) });
}

export async function approve(req: Request, res: Response) {
  res.json({ success: true, booking: await bookingService.approveBooking(actor(req), idOf(req)) });
}

export async function reject(req: Request, res: Response) {
  res.json({ success: true, booking: await bookingService.rejectBooking(actor(req), idOf(req), req.body.note) });
}

export async function cancel(req: Request, res: Response) {
  res.json({ success: true, booking: await bookingService.cancelBooking(actor(req), idOf(req)) });
}
