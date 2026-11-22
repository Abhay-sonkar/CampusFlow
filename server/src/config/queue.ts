import { JobsOptions, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';

export const QUEUE_NAME = 'campusflow';

// BullMQ needs maxRetriesPerRequest: null, because a worker waits on Redis for new jobs for a long time
export const createConnection = () => new IORedis(env.REDIS_URL!, { maxRetriesPerRequest: null });

/*
 * What happens to every job unless we say otherwise:
 *   attempts 3 + exponential backoff -> if the job throws, try again after 5s, then 10s, then give up
 *   removeOnComplete / removeOnFail  -> keep only the latest few finished jobs so Redis does not fill up
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

// null when Redis is not configured (jobs then run inside the API process, see jobs/enqueue.ts)
export const queue = env.REDIS_URL
  ? new Queue(QUEUE_NAME, { connection: createConnection(), defaultJobOptions: DEFAULT_JOB_OPTIONS })
  : null;

if (queue) {
  let lastWarning = 0;
  queue.on('error', (err) => {
    if (Date.now() - lastWarning > 10_000) {
      console.warn('[queue] problem talking to Redis:', err.message);
      lastWarning = Date.now();
    }
  });
}
