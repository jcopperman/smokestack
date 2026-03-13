export type SuiteType = 'playwright' | 'newman' | 'k6';

export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error';

export interface SuiteDefinition {
  id: string;
  name: string;
  description: string;
  type: SuiteType;
  estimatedDurationSecs: number;
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
  created_at: Date;
  updated_at: Date;
}

export interface JobData {
  runId: string;
  suite: string;
  environment: string;
}
