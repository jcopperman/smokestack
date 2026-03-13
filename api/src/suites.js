// Registry of available test suites
// The runner must have matching entries in runner/src/suites.js
const SUITES = {
  'playwright-demo': {
    id: 'playwright-demo',
    name: 'Playwright Demo',
    description: 'End-to-end browser tests using Playwright against playwright.dev',
    type: 'playwright',
    estimatedDurationSecs: 30,
  },
  'newman-demo': {
    id: 'newman-demo',
    name: 'Newman API Demo',
    description: 'API tests using Newman against jsonplaceholder.typicode.com',
    type: 'newman',
    estimatedDurationSecs: 15,
  },
  'k6-demo': {
    id: 'k6-demo',
    name: 'k6 Performance Demo',
    description: 'Load test against jsonplaceholder.typicode.com — 5 VUs, staged ramp, p95 latency + check-rate thresholds',
    type: 'k6',
    estimatedDurationSecs: 40,
  },
};

module.exports = SUITES;
