const fs   = require('fs');
const path = require('path');
const db   = require('./db');
const SUITES = require('./suites');
const { runPlaywright, runNewman } = require('./executor');

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/artifacts';

async function updateRun(runId, fields) {
  const keys   = Object.keys(fields);
  const values = Object.values(fields);
  const sets   = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await db.query(
    `UPDATE runs SET ${sets}, updated_at = NOW() WHERE id = $1`,
    [runId, ...values]
  );
}

async function processJob(job) {
  const { runId, suite, environment } = job.data;

  console.log(`[runner] Starting job: runId=${runId} suite=${suite} env=${environment}`);

  const suiteConfig = SUITES[suite];
  if (!suiteConfig) {
    await updateRun(runId, {
      status: 'error',
      error_message: `Unknown suite: ${suite}`,
    });
    throw new Error(`Unknown suite: ${suite}`);
  }

  // 1. Mark run as running
  await updateRun(runId, { status: 'running' });
  const startTime = Date.now();

  // 2. Set up artifact directory for this run
  const artifactDir = path.join(ARTIFACT_DIR, runId);
  fs.mkdirSync(artifactDir, { recursive: true });
  const logPath = path.join(artifactDir, 'run.log');

  let exitCode = 1;
  let results  = null;
  let errorMessage = null;

  try {
    if (suiteConfig.type === 'playwright') {
      ({ exitCode, results } = await runPlaywright(suiteConfig, artifactDir, logPath));
    } else if (suiteConfig.type === 'newman') {
      ({ exitCode, results } = await runNewman(suiteConfig, artifactDir, logPath));
    } else {
      throw new Error(`Unknown suite type: ${suiteConfig.type}`);
    }
  } catch (err) {
    console.error(`[runner] Execution error for ${runId}:`, err);
    errorMessage = err.message;
    fs.appendFileSync(logPath, `\n[ERROR] ${err.message}\n`);
  }

  const durationMs = Date.now() - startTime;

  // 3. Read log output into DB (truncate if too large)
  let logOutput = '';
  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    logOutput = raw.length > 100000 ? raw.slice(-100000) : raw;
  } catch (_) {}

  // 4. Determine final status
  let status;
  if (errorMessage && !results) {
    status = 'error';
  } else if (exitCode !== 0 || (results && results.failed > 0)) {
    status = 'failed';
  } else {
    status = 'passed';
  }

  // 5. Persist results
  await updateRun(runId, {
    status,
    duration_ms:   durationMs,
    total_tests:   results ? results.total  : null,
    passed_tests:  results ? results.passed : null,
    failed_tests:  results ? results.failed : null,
    artifact_path: runId,
    log_output:    logOutput,
    error_message: errorMessage,
  });

  console.log(`[runner] Completed job: runId=${runId} status=${status} duration=${durationMs}ms`);
}

module.exports = { processJob };
