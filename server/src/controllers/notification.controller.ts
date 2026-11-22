import { Request, Response } from 'express';
import * as notifications from '../services/notification.service';
import { listNotificationsQuery } from '../validators/notification.schema';

const userId = (req: Request) => req.user!.id;

export async function list(req: Request, res: Response) {
  const query = listNotificationsQuery.parse(req.query);
  res.json({ success: true, ...(await notifications.listForUser(userId(req), query)) });
}

// Light call for the bell icon: the app can ask for this every few seconds
export async function unreadCount(req: Request, res: Response) {
  res.json({ success: true, count: await notifications.unreadCount(userId(req)) });
}

export async function markRead(req: Request, res: Response) {
  res.json({ success: true, notification: await notifications.markRead(userId(req), String(req.params.id)) });
}

export async function markAllRead(req: Request, res: Response) {
  res.json({ success: true, updated: await notifications.markAllRead(userId(req)) });
}
