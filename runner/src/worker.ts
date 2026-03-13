import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { processJob } from './processor';
import { JobData } from './types';

const REDIS_URL   = process.env.REDIS_URL   || 'redis://localhost:6379';
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '2');

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

console.log(`[runner] Starting worker — queue=test-runs concurrency=${CONCURRENCY}`);
console.log(`[runner] Redis: ${REDIS_URL}`);
console.log(`[runner] Artifacts dir: ${process.env.ARTIFACT_DIR ?? '/artifacts'}`);

const worker = new Worker<JobData>('test-runs', processJob, {
  connection,
  concurrency: CONCURRENCY,
});

worker.on('completed', (job: Job<JobData>) => {
  console.log(`[runner] Job ${job.id} completed`);
});

worker.on('failed', (job: Job<JobData> | undefined, err: Error) => {
  console.error(`[runner] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err: Error) => {
  console.error('[runner] Worker error:', err);
});

async function shutdown(): Promise<void> {
  console.log('[runner] Shutting down gracefully…');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
