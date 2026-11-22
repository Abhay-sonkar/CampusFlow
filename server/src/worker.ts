// The worker: a separate program that takes jobs out of the queue and does them.
// Run it in its own terminal:  npm run worker
import dns from 'dns';
import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { connectDB } from './config/db';
import { env } from './config/env';
import { QUEUE_NAME, createConnection, queue } from './config/queue';
import { redis } from './config/redis';
import { processJob } from './jobs/handlers';

// Same workaround as server.ts: local DNS can't resolve Atlas SRV records
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function main() {
  if (!env.REDIS_URL || !queue) {
    console.error('REDIS_URL is not set. The worker needs Redis (without it, the API runs jobs by itself).');
    process.exit(1);
  }
  await connectDB();

  const worker = new Worker(QUEUE_NAME, (job) => processJob(job.name, job.data), {
    connection: createConnection(),
    concurrency: 5, // up to 5 jobs at the same time
  });

  worker.on('ready', () => console.log('Worker ready, waiting for jobs...'));
  worker.on('completed', (job) => console.log(`[job done]   ${job.name} #${job.id}`));
  worker.on('failed', (job, err) =>
    console.error(`[job failed] ${job?.name} #${job?.id} (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`)
  );
  worker.on('error', (err) => console.error('[worker error]', err.message));

  // A repeating job: BullMQ adds a "deadlines.scan" job every hour. Calling this again changes nothing.
  await queue.upsertJobScheduler('deadline-scan', { every: 60 * 60 * 1000 }, { name: 'deadlines.scan', data: {} });

  // "I am alive" signal for the admin stats endpoint: expires by itself if the worker stops
  const beat = () => redis?.set('worker:heartbeat', String(Date.now()), 'EX', 15).catch(() => undefined);
  beat();
  const timer = setInterval(beat, 5000);

  // On Ctrl+C: stop taking new jobs, let the running ones finish, then exit
  const shutdown = async (signal: string) => {
    console.log(`${signal} received, finishing running jobs...`);
    clearInterval(timer);
    await worker.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
