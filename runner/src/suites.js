// Maps suite IDs to execution config.
// cwd values must match volume mount paths (./examples → /suites in Docker)
const SUITES = {
  'playwright-demo': {
    type: 'playwright',
    cwd: '/suites/playwright-demo',
    // Command is built dynamically in executor with ARTIFACT_DIR injected
  },
  'newman-demo': {
    type: 'newman',
    cwd: '/suites/newman-demo',
  },
  'k6-demo': {
    type: 'k6',
    cwd: '/suites/k6-demo',
  },
};

module.exports = SUITES;
