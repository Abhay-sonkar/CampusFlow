import { Request, Response } from 'express';
import * as complaintService from '../services/complaint.service';
import { ApiError } from '../utils/ApiError';
import { listComplaintsQuery } from '../validators/complaint.schema';

const actor = (req: Request) => req.user!; // set by authenticate middleware
const idOf = (req: Request) => String(req.params.id);

export async function list(req: Request, res: Response) {
  const query = listComplaintsQuery.parse(req.query);
  res.json({ success: true, ...(await complaintService.listComplaints(actor(req), query)) });
}

export async function getOne(req: Request, res: Response) {
  res.json({ success: true, complaint: await complaintService.getComplaint(actor(req), idOf(req)) });
}

export async function create(req: Request, res: Response) {
  const complaint = await complaintService.createComplaint(actor(req), req.body);
  res.status(201).json({ success: true, complaint });
}

export async function assign(req: Request, res: Response) {
  const { assigneeId, note } = req.body;
  res.json({ success: true, complaint: await complaintService.assignComplaint(actor(req), idOf(req), assigneeId, note) });
}

export async function changeStatus(req: Request, res: Response) {
  const { status, note } = req.body;
  res.json({ success: true, complaint: await complaintService.changeStatus(actor(req), idOf(req), status, note) });
}

export async function confirm(req: Request, res: Response) {
  res.json({ success: true, complaint: await complaintService.confirmResolution(actor(req), idOf(req)) });
}

export async function reopen(req: Request, res: Response) {
  res.json({ success: true, complaint: await complaintService.reopenComplaint(actor(req), idOf(req), req.body.note) });
}

export async function comment(req: Request, res: Response) {
  const complaint = await complaintService.addComment(actor(req), idOf(req), req.body.text);
  res.status(201).json({ success: true, complaint });
}

export async function uploadEvidence(req: Request, res: Response) {
  const files = (req.files as { filename: string; originalname: string }[] | undefined) ?? [];
  if (files.length === 0) throw new ApiError(400, 'Attach at least one file in the "files" field');
  try {
    const complaint = await complaintService.addEvidence(actor(req), idOf(req), files);
    res.json({ success: true, complaint });
  } catch (err) {
    // The files already hit the disk; remove them if the request was refused
    await Promise.all(files.map((f) => complaintService.removeFile(`/uploads/complaints/${f.filename}`)));
    throw err;
  }
}
