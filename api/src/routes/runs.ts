import { Router, Request, Response } from 'express';
import pool from '../db';
import { runQueue } from '../queue';
import SUITES from '../suites';

const router = Router();

// POST /api/runs — trigger a new test run
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { suite, environment = 'default' } = req.body as { suite: string; environment?: string };

  if (!suite) {
    res.status(400).json({ error: 'suite is required' });
    return;
  }

  if (!SUITES[suite]) {
    res.status(400).json({ error: `Unknown suite: "${suite}"`, available: Object.keys(SUITES) });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO runs (suite, environment, status)
       VALUES ($1, $2, 'queued')
       RETURNING id, suite, environment, status, created_at`,
      [suite, environment]
    );
    const run = result.rows[0];

    await runQueue.add('execute', { runId: run.id, suite, environment }, { jobId: run.id });

    res.status(201).json(run);
  } catch (err) {
    console.error('Failed to create run:', err);
    res.status(500).json({ error: 'Failed to create run' });
  }
});

// GET /api/runs — list runs
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const status = req.query.status as string | undefined;

  try {
    const params: (string | number)[] = [];
    let query = 'SELECT * FROM runs';

    if (status) {
      params.push(status);
      query += ` WHERE status = $${params.length}`;
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(
        status ? 'SELECT COUNT(*) FROM runs WHERE status = $1' : 'SELECT COUNT(*) FROM runs',
        status ? [status] : []
      ),
    ]);

    res.json({
      runs: result.rows,
      total: parseInt(countResult.rows[0].count as string),
      limit,
      offset,
    });
  } catch (err) {
    console.error('Failed to list runs:', err);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// GET /api/runs/:id — get a single run
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM runs WHERE id = $1', [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to get run:', err);
    res.status(500).json({ error: 'Failed to get run' });
  }
});

// GET /api/runs/:id/logs — get log output
router.get('/:id/logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT log_output, status FROM runs WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    const { log_output, status } = result.rows[0] as { log_output: string | null; status: string };
    res.json({ log_output: log_output ?? '', status });
  } catch (err) {
    console.error('Failed to get logs:', err);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

export default router;
