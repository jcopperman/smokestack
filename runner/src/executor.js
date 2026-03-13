const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

/**
 * Run a shell command, streaming stdout/stderr to a log file.
 * Returns { exitCode, logPath }.
 */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const { cwd, env, logPath } = options;

    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    // Swallow write-after-end — can happen when 'error' and 'close' fire back-to-back
    // on a spawn failure (e.g. ENOENT). We handle cleanup in the single 'close' handler.
    logStream.on('error', (err) => {
      if (err.code !== 'ERR_STREAM_WRITE_AFTER_END') throw err;
    });

    const ts = () => `[${new Date().toISOString()}] `;
    logStream.write(`${ts()}▶ ${cmd} ${args.join(' ')}\n\n`);

    let spawnError = null;

    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
    });

    proc.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });

    proc.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });

    // Capture spawn errors (e.g. ENOENT) — 'close' always fires afterward
    proc.on('error', (err) => {
      spawnError = err;
    });

    // Single settlement point: 'close' always fires, even after 'error'
    proc.on('close', (code) => {
      const exitCode = spawnError ? 1 : code;
      const msg = spawnError
        ? `\n${ts()}ERROR: ${spawnError.message} (is "${cmd}" installed?)\n`
        : `\n${ts()}Process exited with code ${exitCode}\n`;
      process.stdout.write(msg);
      logStream.write(msg);
      logStream.end(() => resolve({ exitCode, logPath }));
    });
  });
}

/**
 * Execute a Playwright test suite.
 * Returns { exitCode, results } where results = { total, passed, failed }.
 */
async function runPlaywright(suiteConfig, artifactDir, logPath) {
  const resultsJson = path.join(artifactDir, 'results.json');
  const htmlReportDir = path.join(artifactDir, 'html-report');

  const env = {
    ARTIFACT_DIR: artifactDir,
    PLAYWRIGHT_HTML_REPORT: htmlReportDir,
    CI: '1',
  };

  // Use the globally-installed playwright CLI from the base Docker image.
  // Do NOT pass --reporter on the command line — let playwright.config.js handle
  // reporters so the JSON/HTML output paths (set via ARTIFACT_DIR env var) are honoured.
  const { exitCode } = await runCommand(
    'playwright', ['test'],
    {
      cwd: suiteConfig.cwd,
      env,
      logPath,
    }
  );

  const results = parsePlaywrightResults(resultsJson);
  return { exitCode, results };
}

/**
 * Execute a Newman test suite.
 * Returns { exitCode, results } where results = { total, passed, failed }.
 */
async function runNewman(suiteConfig, artifactDir, logPath) {
  const resultsJson = path.join(artifactDir, 'results.json');
  const htmlReport  = path.join(artifactDir, 'report.html');

  const args = [
    'run', 'collection.json',
    '--reporters', 'cli,json,htmlextra',
    '--reporter-json-export', resultsJson,
    '--reporter-htmlextra-export', htmlReport,
    '--timeout-request', '15000',
  ];

  // Use environment file if it exists
  const envFile = path.join(suiteConfig.cwd, 'environment.json');
  if (fs.existsSync(envFile)) {
    args.push('--environment', envFile);
  }

  const { exitCode } = await runCommand(
    'newman', args,
    { cwd: suiteConfig.cwd, logPath }
  );

  const results = parseNewmanResults(resultsJson);
  return { exitCode, results };
}

function parsePlaywrightResults(jsonPath) {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const stats = raw.stats || {};
    const total  = (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.skipped ?? 0);
    const failed = stats.unexpected ?? 0;
    const passed = stats.expected ?? 0;
    return { total, passed, failed };
  } catch (e) {
    console.error('Failed to parse Playwright results:', e.message);
    return null;
  }
}

function parseNewmanResults(jsonPath) {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const stats = raw.run && raw.run.stats;
    if (!stats) return null;
    const total  = stats.tests ? stats.tests.total  : 0;
    const failed = stats.tests ? stats.tests.failed : 0;
    const passed = total - failed;
    return { total, passed, failed };
  } catch (e) {
    console.error('Failed to parse Newman results:', e.message);
    return null;
  }
}

/**
 * Execute a k6 performance test suite.
 * Returns { exitCode, results } where results = { total, passed, failed }.
 * "tests" are mapped to k6 checks (each check() assertion counts as one test).
 */
async function runK6(suiteConfig, artifactDir, logPath) {
  const summaryJson = path.join(artifactDir, 'summary.json');

  // Pass ARTIFACT_DIR via -e so handleSummary in the script can write summary.json.
  // --summary-export was removed in k6 v0.46; handleSummary is the replacement.
  const { exitCode } = await runCommand(
    'k6', ['run', '-e', `ARTIFACT_DIR=${artifactDir}`, 'script.js'],
    { cwd: suiteConfig.cwd, logPath }
  );

  const results = parseK6Results(summaryJson);
  return { exitCode, results };
}

function parseK6Results(jsonPath) {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    const raw    = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const checks = raw.metrics && raw.metrics.checks;
    if (!checks) return null;
    const passed = checks.values.passes || 0;
    const failed = checks.values.fails  || 0;
    return { total: passed + failed, passed, failed };
  } catch (e) {
    console.error('Failed to parse k6 results:', e.message);
    return null;
  }
}

module.exports = { runPlaywright, runNewman, runK6 };
