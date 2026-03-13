const express = require('express');
const router = express.Router();
const db = require('../db');
const { runQueue } = require('../queue');
const SUITES = require('../suites');

// POST /api/runs - trigger a new test run
router.post('/', async (req, res) => {
  const { suite, environment = 'default' } = req.body;

  if (!suite) {
    return res.status(400).json({ error: 'suite is required' });
  }

  if (!SUITES[suite]) {
    return res.status(400).json({
      error: `Unknown suite: "${suite}"`,
      available: Object.keys(SUITES),
    });
  }

  try {
    const result = await db.query(
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

// GET /api/runs - list all runs
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const status = req.query.status;

  try {
    let query = `SELECT * FROM runs`;
    const params = [];
    if (status) {
      params.push(status);
      query += ` WHERE status = $${params.length}`;
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    const countResult = await db.query(
      status ? `SELECT COUNT(*) FROM runs WHERE status = $1` : `SELECT COUNT(*) FROM runs`,
      status ? [status] : []
    );

    res.json({
      runs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  } catch (err) {
    console.error('Failed to list runs:', err);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// GET /api/runs/:id - get a single run
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM runs WHERE id = $1', [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Run not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to get run:', err);
    res.status(500).json({ error: 'Failed to get run' });
  }
});

// GET /api/runs/:id/logs - get log output for a run
router.get('/:id/logs', async (req, res) => {
  try {
    const result = await db.query('SELECT log_output, status FROM runs WHERE id = $1', [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Run not found' });
    }
    const { log_output, status } = result.rows[0];
    res.json({ log_output: log_output || '', status });
  } catch (err) {
    console.error('Failed to get logs:', err);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

module.exports = router;
