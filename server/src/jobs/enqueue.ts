import { JobsOptions } from 'bullmq';
import { queue } from '../config/queue';
import { JobData, JobName } from './types';

const ADD_TIMEOUT_MS = 2000;

/*
 * "Do this later, somewhere else". The API calls this and moves on without waiting for the work.
 *
 *  - Normal case: the job is stored in Redis and the separate worker process picks it up.
 *  - No Redis, or Redis does not answer in 2 seconds: run the job inside this process, in the background.
 *    Notifications then still arrive; they are just not handled by a separate worker.
 *
 * It never throws, so a queue problem can never break the request that triggered it.
 */
export async function enqueueJob<N extends JobName>(name: N, data: JobData[N], options?: JobsOptions): Promise<void> {
  if (queue) {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        queue.add(name, data, options),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Redis did not answer in time')), ADD_TIMEOUT_MS);
        }),
      ]);
      return;
    } catch (err) {
      console.warn(`[queue] could not queue "${name}", running it here instead: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // Loaded only now, to avoid a circular import (the handlers use services that call enqueueJob)
  setImmediate(() => {
    import('./handlers')
      .then((m) => m.processJob(name, data))
      .catch((err) => console.error(`[queue] job "${name}" failed:`, err));
  });
}
