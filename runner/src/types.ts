export type SuiteType = 'playwright' | 'newman' | 'k6' | 'pactum';

export interface RunnerSuiteConfig {
  type: SuiteType;
  cwd: string;
}

export interface TestResults {
  total: number;
  passed: number;
  failed: number;
}

export interface CommandResult {
  exitCode: number;
  logPath: string;
}

export interface ExecutionResult {
  exitCode: number;
  results: TestResults | null;
}

export interface JobData {
  runId: string;
  suite: string;
  environment: string;
  env?: Record<string, string>;
}

export type RunUpdateFields = Partial<{
  status: string;
  error_message: string | null;
  duration_ms: number;
  total_tests: number | null;
  passed_tests: number | null;
  failed_tests: number | null;
  artifact_path: string;
  log_output: string;
}>;
