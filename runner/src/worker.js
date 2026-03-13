const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { processJob } = require('./processor');

const REDIS_URL  = process.env.REDIS_URL  || 'redis://localhost:6379';
const CONCURRENCY = parseInt(process.env.CONCURRENCY) || 2;

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

console.log(`[runner] Starting worker — queue=test-runs concurrency=${CONCURRENCY}`);
console.log(`[runner] Redis: ${REDIS_URL}`);
console.log(`[runner] Artifacts dir: ${process.env.ARTIFACT_DIR || '/artifacts'}`);

const worker = new Worker('test-runs', processJob, {
  connection,
  concurrency: CONCURRENCY,
});

worker.on('completed', (job) => {
  console.log(`[runner] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[runner] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[runner] Worker error:', err);
});

// Graceful shutdown
async function shutdown() {
  console.log('[runner] Shutting down gracefully…');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
