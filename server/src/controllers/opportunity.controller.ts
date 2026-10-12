import { Request, Response } from 'express';
import * as engagement from '../services/engagement.service';
import * as opportunities from '../services/opportunity.service';
import { listBookmarksQuery } from '../validators/application.schema';
import { listOpportunitiesQuery, recommendedQuery } from '../validators/opportunity.schema';

const actor = (req: Request) => req.user!;
const idOf = (req: Request) => String(req.params.id);

export async function browse(req: Request, res: Response) {
  const query = listOpportunitiesQuery.parse(req.query);
  res.json({ success: true, ...(await opportunities.browse(actor(req), query)) });
}

export async function recommended(req: Request, res: Response) {
  const { limit } = recommendedQuery.parse(req.query);
  res.json({ success: true, items: await opportunities.recommend(actor(req), limit) });
}

export async function getOne(req: Request, res: Response) {
  res.json({ success: true, opportunity: await opportunities.getOpportunity(actor(req), idOf(req)) });
}

export async function create(req: Request, res: Response) {
  res.status(201).json({ success: true, opportunity: await opportunities.createOpportunity(actor(req), req.body) });
}

export async function update(req: Request, res: Response) {
  res.json({ success: true, opportunity: await opportunities.updateOpportunity(actor(req), idOf(req), req.body) });
}

export async function remove(req: Request, res: Response) {
  await opportunities.deleteOpportunity(actor(req), idOf(req));
  res.json({ success: true, message: 'Opportunity deleted' });
}

export async function bookmark(req: Request, res: Response) {
  await engagement.addBookmark(actor(req), idOf(req));
  res.json({ success: true, bookmarked: true });
}

export async function unbookmark(req: Request, res: Response) {
  await engagement.removeBookmark(actor(req), idOf(req));
  res.json({ success: true, bookmarked: false });
}

export async function listBookmarks(req: Request, res: Response) {
  const query = listBookmarksQuery.parse(req.query);
  res.json({ success: true, ...(await engagement.listBookmarks(actor(req), query)) });
}

export async function apply(req: Request, res: Response) {
  const application = await engagement.applyTo(actor(req), idOf(req), req.body?.notes);
  res.status(201).json({ success: true, application });
}
