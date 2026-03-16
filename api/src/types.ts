export type SuiteType = 'playwright' | 'newman' | 'k6' | 'pactum';

export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error';

export interface SuiteDefinition {
  id: string;
  name: string;
  description: string;
  type: SuiteType;
  estimatedDurationSecs: number;
  tags: string[];
}

export interface RunRecord {
  id: string;
  suite: string;
  environment: string;
  status: RunStatus;
  total_tests: number | null;
  passed_tests: number | null;
  failed_tests: number | null;
  duration_ms: number | null;
  artifact_path: string | null;
  error_message: string | null;
  log_output: string | null;
  env_vars: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

export interface JobData {
  runId: string;
  suite: string;
  environment: string;
  env?: Record<string, string>;
}
