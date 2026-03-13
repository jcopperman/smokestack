import { Router, Request, Response } from 'express';
import https from 'https';
import fs from 'fs';
import { runQueue } from '../queue';

const router = Router();

const SA_TOKEN = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const SA_CA    = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const SA_NS    = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';

function inCluster(): boolean {
  return fs.existsSync(SA_TOKEN);
}

interface PodStatus { running: number; pending: number; total: number }

async function getRunnerPods(): Promise<PodStatus | null> {
  if (!inCluster()) return null;
  try {
    const token     = fs.readFileSync(SA_TOKEN, 'utf8');
    const ca        = fs.readFileSync(SA_CA);
    const namespace = fs.readFileSync(SA_NS, 'utf8').trim();

    const body = await new Promise<string>((resolve, reject) => {
      const req = https.request({
        hostname: 'kubernetes.default.svc',
        path: `/api/v1/namespaces/${namespace}/pods?labelSelector=app%3Dsmokestack-runner`,
        headers: { Authorization: `Bearer ${token}` },
        ca,
      }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.end();
    });

    const parsed = JSON.parse(body) as {
      items?: Array<{ status: { phase: string } }>;
    };
    const pods    = parsed.items ?? [];
    const running = pods.filter(p => p.status.phase === 'Running').length;
    const pending = pods.filter(p => p.status.phase === 'Pending').length;
    return { running, pending, total: pods.length };
  } catch (err) {
    console.error('[runner status] k8s pod query failed:', (err as Error).message);
    return null;
  }
}

// GET /api/runner/status
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [counts, pods] = await Promise.all([
      runQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      getRunnerPods(),
    ]);
    res.json({
      queue: {
        waiting:   counts.waiting   ?? 0,
        active:    counts.active    ?? 0,
        completed: counts.completed ?? 0,
        failed:    counts.failed    ?? 0,
      },
      pods,           // null when not running in Kubernetes
      inCluster: inCluster(),
    });
  } catch (err) {
    console.error('[runner status] failed:', err);
    res.status(500).json({ error: 'Failed to get runner status' });
  }
});

export default router;
