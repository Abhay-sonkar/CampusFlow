import { Request, Response } from 'express';
import * as bookingService from '../services/booking.service';
import * as resourceService from '../services/resource.service';
import { availabilityQuery } from '../validators/booking.schema';
import { listResourcesQuery } from '../validators/resource.schema';

const idOf = (req: Request) => String(req.params.id);

export async function list(req: Request, res: Response) {
  const query = listResourcesQuery.parse(req.query);
  res.json({ success: true, ...(await resourceService.listResources(req.user!.role, query)) });
}

export async function getOne(req: Request, res: Response) {
  res.json({ success: true, resource: await resourceService.getResource(idOf(req)) });
}

export async function availability(req: Request, res: Response) {
  const { from, to } = availabilityQuery.parse(req.query);
  res.json({ success: true, ...(await bookingService.getAvailability(idOf(req), from, to)) });
}

export async function create(req: Request, res: Response) {
  res.status(201).json({ success: true, resource: await resourceService.createResource(req.body) });
}

export async function update(req: Request, res: Response) {
  res.json({ success: true, resource: await resourceService.updateResource(idOf(req), req.body) });
}
