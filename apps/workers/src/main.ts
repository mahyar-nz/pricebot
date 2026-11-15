
import { Queue, Worker } from 'bullmq';
import { Db } from '@pricing/api/dist/db.js';
import { retentionBoundaries } from './maintenance.js';
import { createServer } from 'node:http';

const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
};
const db = new Db();
await db.$connect();
const queue = new Queue('platform-maintenance', { connection });
const worker = new Worker('platform-maintenance', async job => {
  if (job.name !== 'expire-security-records') throw new Error('Unsupported job');
  const boundaries = retentionBoundaries(new Date());
  const [sessions, otps, limits] = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: boundaries.sessionExpiry } } }),
    db.otpChallenge.deleteMany({ where: { expiresAt: { lt: boundaries.otpExpiry } } }),
    db.rateLimit.deleteMany({ where: { windowStart: { lt: boundaries.rateLimitWindow } } }),
  ]);
  return { sessions: sessions.count, otps: otps.count, rateLimits: limits.count };
}, { connection, concurrency: 1 });
worker.on('completed', job => console.log(JSON.stringify({ event: 'maintenance.completed', jobId: job.id })));
worker.on('failed', (job, error) => console.error(JSON.stringify({ event: 'maintenance.failed', jobId: job?.id, error: error.name })));
worker.on('error', error => console.error(JSON.stringify({ event: 'worker.error', error: error.name })));
await queue.upsertJobScheduler('security-retention-hourly', { every: 3_600_000 }, {
  name: 'expire-security-records', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 200 },
});
const health = createServer(async (_request, response) => {
  try {
    const counts = await queue.getJobCounts();
    if (!counts) throw new Error("Queue unavailable");
    await db.$queryRaw`SELECT 1`;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', queues: ['platform-maintenance'], repricingScheduler: 'not_enabled' }));
  } catch {
    response.writeHead(503); response.end('unavailable');
  }
});
health.listen(Number(process.env.WORKER_PORT || 4002), '0.0.0.0');
console.log(JSON.stringify({ event: 'worker.ready', queue: 'platform-maintenance' }));
async function shutdown() { health.close(); await worker.close(); await queue.close(); await db.$disconnect(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

