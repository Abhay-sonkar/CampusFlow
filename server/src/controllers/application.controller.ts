import { Request, Response } from 'express';
import * as engagement from '../services/engagement.service';
import { listApplicationsQuery } from '../validators/application.schema';

const actor = (req: Request) => req.user!;
const idOf = (req: Request) => String(req.params.id);

export async function list(req: Request, res: Response) {
  const query = listApplicationsQuery.parse(req.query);
  res.json({ success: true, ...(await engagement.listApplications(actor(req), query)) });
}

export async function update(req: Request, res: Response) {
  res.json({ success: true, application: await engagement.updateApplication(actor(req), idOf(req), req.body) });
}

export async function remove(req: Request, res: Response) {
  await engagement.removeApplication(actor(req), idOf(req));
  res.json({ success: true, message: 'Application removed' });
}
