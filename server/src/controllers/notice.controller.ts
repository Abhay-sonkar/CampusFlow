import { Request, Response } from 'express';
import * as noticeService from '../services/notice.service';
import { ApiError } from '../utils/ApiError';
import { listNoticesQuery } from '../validators/notice.schema';

const actor = (req: Request) => req.user!; // set by authenticate middleware
const idOf = (req: Request) => String(req.params.id);

export async function listFeed(req: Request, res: Response) {
  const query = listNoticesQuery.parse(req.query);
  res.json({ success: true, ...(await noticeService.listFeed(actor(req), query)) });
}

export async function listManaged(req: Request, res: Response) {
  const query = listNoticesQuery.parse(req.query);
  res.json({ success: true, ...(await noticeService.listManaged(actor(req), query)) });
}

export async function getOne(req: Request, res: Response) {
  res.json({ success: true, notice: await noticeService.getNotice(actor(req), idOf(req)) });
}

export async function create(req: Request, res: Response) {
  const notice = await noticeService.createNotice(actor(req), req.body);
  res.status(201).json({ success: true, notice });
}

export async function update(req: Request, res: Response) {
  const notice = await noticeService.updateNotice(actor(req), idOf(req), req.body);
  res.json({ success: true, notice });
}

export async function publish(req: Request, res: Response) {
  res.json({ success: true, notice: await noticeService.setPublished(actor(req), idOf(req), true) });
}

export async function unpublish(req: Request, res: Response) {
  res.json({ success: true, notice: await noticeService.setPublished(actor(req), idOf(req), false) });
}

export async function remove(req: Request, res: Response) {
  await noticeService.deleteNotice(actor(req), idOf(req));
  res.json({ success: true, message: 'Notice deleted' });
}

export async function uploadAttachment(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Attach a PDF in the "file" field');
  try {
    const notice = await noticeService.setAttachment(actor(req), idOf(req), file);
    res.json({ success: true, notice });
  } catch (err) {
    // The upload already hit the disk; remove it if the request was refused
    await noticeService.removeFile(`/uploads/notices/${file.filename}`);
    throw err;
  }
}
