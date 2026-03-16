import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { RunnerSuiteConfig, TestResults, ExecutionResult } from './types';

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logPath: string;
}

interface CommandResult {
  exitCode: number;
  logPath: string;
}

/**
 * Run a shell command, streaming stdout/stderr to a log file.
 * Returns { exitCode, logPath }.
 */
function runCommand(cmd: string, args: string[], options: CommandOptions): Promise<CommandResult> {
  return new Promise((resolve) => {
    const { cwd, env, logPath } = options;

    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    // Swallow write-after-end — can happen when 'error' and 'close' fire back-to-back
    // on a spawn failure (e.g. ENOENT). We handle cleanup in the single 'close' handler.
    logStream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'ERR_STREAM_WRITE_AFTER_END') throw err;
    });

    const ts = (): string => `[${new Date().toISOString()}] `;
    logStream.write(`${ts()}▶ ${cmd} ${args.join(' ')}\n\n`);

    let spawnError: Error | null = null;

    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });

    // Capture spawn errors (e.g. ENOENT) — 'close' always fires afterward
    proc.on('error', (err: Error) => {
      spawnError = err;
    });

    // Single settlement point: 'close' always fires, even after 'error'
    proc.on('close', (code: number | null) => {
      const exitCode = spawnError ? 1 : (code ?? 1);
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
export async function runPlaywright(
  suiteConfig: RunnerSuiteConfig,
  artifactDir: string,
  logPath: string,
  extraEnv: Record<string, string> = {}
): Promise<ExecutionResult> {
  const resultsJson = path.join(artifactDir, 'results.json');
  const htmlReportDir = path.join(artifactDir, 'html-report');

  const env: NodeJS.ProcessEnv = {
    ARTIFACT_DIR: artifactDir,
    PLAYWRIGHT_HTML_REPORT: htmlReportDir,
    CI: '1',
    ...extraEnv,
  };

  // Use the globally-installed playwright CLI from the base Docker image.
  // Do NOT pass --reporter on the command line — let playwright.config.ts handle
  // reporters so the JSON/HTML output paths (set via ARTIFACT_DIR env var) are honoured.
  const { exitCode } = await runCommand('playwright', ['test'], {
    cwd: suiteConfig.cwd,
    env,
    logPath,
  });

  const results = parsePlaywrightResults(resultsJson);
  return { exitCode, results };
}

/**
 * Execute a Newman test suite.
 * Returns { exitCode, results } where results = { total, passed, failed }.
 */
export async function runNewman(
  suiteConfig: RunnerSuiteConfig,
  artifactDir: string,
  logPath: string,
  extraEnv: Record<string, string> = {}
): Promise<ExecutionResult> {
  const resultsJson = path.join(artifactDir, 'results.json');
  const htmlReport = path.join(artifactDir, 'report.html');

  const args = [
    'run', 'collection.json',
    '--reporters', 'cli,json,htmlextra',
    '--reporter-json-export', resultsJson,
    '--reporter-htmlextra-export', htmlReport,
    '--timeout-request', '15000',
  ];

  // Load environment file if present
  const envFile = path.join(suiteConfig.cwd, 'environment.json');
  if (fs.existsSync(envFile)) {
    args.push('--environment', envFile);
  }

  const { exitCode } = await runCommand('newman', args, {
    cwd: suiteConfig.cwd,
    env: { ...extraEnv },
    logPath,
  });

  const results = parseNewmanResults(resultsJson);
  return { exitCode, results };
}

/**
 * Execute a k6 performance test suite.
 * Returns { exitCode, results } where results = { total, passed, failed }.
 * "tests" are mapped to k6 checks (each check() assertion counts as one test).
 */
export async function runK6(
  suiteConfig: RunnerSuiteConfig,
  artifactDir: string,
  logPath: string,
  extraEnv: Record<string, string> = {}
): Promise<ExecutionResult> {
  const summaryJson = path.join(artifactDir, 'summary.json');

  // Pass ARTIFACT_DIR via -e so handleSummary in the script can write summary.json.
  // --summary-export was removed in k6 v0.46; handleSummary is the replacement.
  // Extra env vars are also passed via -e since k6 reads __ENV from -e flags, not process.env.
  const extraArgs = Object.entries(extraEnv).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const { exitCode } = await runCommand(
    'k6', ['run', '-e', `ARTIFACT_DIR=${artifactDir}`, ...extraArgs, 'script.js'],
    { cwd: suiteConfig.cwd, logPath }
  );

  const results = parseK6Results(summaryJson);
  return { exitCode, results };
}

/**
 * Execute a Pactum API test suite via Jest.
 * Returns { exitCode, results } where results = { total, passed, failed }.
 */
export async function runPactum(
  suiteConfig: RunnerSuiteConfig,
  artifactDir: string,
  logPath: string,
  extraEnv: Record<string, string> = {}
): Promise<ExecutionResult> {
  const resultsJson = path.join(artifactDir, 'results.json');

  const { exitCode } = await runCommand(
    'jest',
    ['--json', `--outputFile=${resultsJson}`, '--forceExit'],
    {
      cwd: suiteConfig.cwd,
      env: { ARTIFACT_DIR: artifactDir, ...extraEnv },
      logPath,
    }
  );

  const results = parsePactumResults(resultsJson);
  return { exitCode, results };
}

function parsePlaywrightResults(jsonPath: string): TestResults | null {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
      stats?: { expected?: number; unexpected?: number; skipped?: number };
    };
    const stats = raw.stats ?? {};
    const total  = (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.skipped ?? 0);
    const failed = stats.unexpected ?? 0;
    const passed = stats.expected ?? 0;
    return { total, passed, failed };
  } catch (e) {
    console.error('Failed to parse Playwright results:', (e as Error).message);
    return null;
  }
}

function parseNewmanResults(jsonPath: string): TestResults | null {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
      run?: { stats?: { tests?: { total: number; failed: number } } };
    };
    const stats = raw.run?.stats;
    if (!stats) return null;
    const total  = stats.tests?.total  ?? 0;
    const failed = stats.tests?.failed ?? 0;
    const passed = total - failed;
    return { total, passed, failed };
  } catch (e) {
    console.error('Failed to parse Newman results:', (e as Error).message);
    return null;
  }
}

function parseK6Results(jsonPath: string): TestResults | null {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
      metrics?: { checks?: { values: { passes: number; fails: number } } };
    };
    const checks = raw.metrics?.checks;
    if (!checks) return null;
    const passed = checks.values.passes ?? 0;
    const failed = checks.values.fails  ?? 0;
    return { total: passed + failed, passed, failed };
  } catch (e) {
    console.error('Failed to parse k6 results:', (e as Error).message);
    return null;
  }
}

function parsePactumResults(jsonPath: string): TestResults | null {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
      numTotalTests?:  number;
      numPassedTests?: number;
      numFailedTests?: number;
    };
    const total  = raw.numTotalTests  ?? 0;
    const passed = raw.numPassedTests ?? 0;
    const failed = raw.numFailedTests ?? 0;
    return { total, passed, failed };
  } catch (e) {
    console.error('Failed to parse Pactum results:', (e as Error).message);
    return null;
  }
}
