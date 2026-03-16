import { RunnerSuiteConfig } from './types';

// Maps suite IDs to execution config.
// cwd values must match volume mount paths (./examples → /suites in Docker)
const SUITES: Record<string, RunnerSuiteConfig> = {
  'playwright-demo': {
    type: 'playwright',
    cwd: '/suites/playwright-demo',
  },
  'newman-demo': {
    type: 'newman',
    cwd: '/suites/newman-demo',
  },
  'k6-demo': {
    type: 'k6',
    cwd: '/suites/k6-demo',
  },
  'pactum-demo': {
    type: 'pactum',
    cwd: '/suites/pactum-demo',
  },
};

export default SUITES;
