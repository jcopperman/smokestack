import { Router, Request, Response } from 'express';
import pool from '../db';
import SUITES from '../suites';

const router = Router();

// GET /api/suites — list all suites with optional ?tag= filter
router.get('/', (req: Request, res: Response) => {
  const tag = req.query.tag as string | undefined;
  let suiteList = Object.values(SUITES);
  if (tag) {
    suiteList = suiteList.filter(s => s.tags.includes(tag));
  }
  res.json(suiteList);
});

// GET /api/suites/:id/history — last N completed runs for a suite
router.get('/:id/history', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!SUITES[id]) {
    res.status(404).json({ error: `Suite not found: "${id}"` });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  try {
    const result = await pool.query(
      `SELECT id, status, passed_tests, failed_tests, total_tests, duration_ms, created_at
       FROM runs
       WHERE suite = $1 AND status IN ('passed', 'failed', 'error')
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, limit]
    );

    const history = result.rows.map(row => ({
      ...row,
      pass_rate: row.total_tests > 0
        ? (row.passed_tests ?? 0) / row.total_tests
        : null,
    }));

    res.json({ suite: id, history });
  } catch (err) {
    console.error('Failed to get suite history:', err);
    res.status(500).json({ error: 'Failed to get suite history' });
  }
});

export default router;
