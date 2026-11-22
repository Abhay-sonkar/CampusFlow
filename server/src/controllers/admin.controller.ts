import { Request, Response } from 'express';
import { queue } from '../config/queue';
import { redis } from '../config/redis';
import { enqueueJob } from '../jobs/enqueue';

// How is the job queue doing? Is a worker running?
export async function jobStats(_req: Request, res: Response) {
  if (!queue) return res.json({ success: true, queue: 'disabled' });
  const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
  const heartbeat = redis ? await redis.get('worker:heartbeat').catch(() => null) : null;
  res.json({ success: true, queue: 'ready', workerOnline: Boolean(heartbeat), counts });
}

// Run the deadline reminder scan now instead of waiting for the hourly schedule
export async function triggerDeadlineScan(_req: Request, res: Response) {
  await enqueueJob('deadlines.scan', {});
  // 202 Accepted: "got it, it will be done in the background", not "it is done"
  res.status(202).json({ success: true, message: 'Deadline scan queued' });
}
