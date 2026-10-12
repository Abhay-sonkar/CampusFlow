import { Request, Response } from 'express';
import * as userService from '../services/user.service';

export async function updateMe(req: Request, res: Response) {
  res.json({ success: true, user: await userService.updateProfile(req.user!.id, req.body) });
}
