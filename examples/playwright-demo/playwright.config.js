const path = require('path');

// Allow the runner to inject an artifact output directory
const artifactDir = process.env.ARTIFACT_DIR
  ? path.join(process.env.ARTIFACT_DIR)
  : path.join(__dirname, 'test-results');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  workers: 1,

  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    // Capture screenshot only on failure
    screenshot: 'only-on-failure',
    // Capture video only on failure
    video: 'retain-on-failure',
  },

  reporter: [
    ['list'],
    ['json', { outputFile: path.join(artifactDir, 'results.json') }],
    ['html', { outputFolder: path.join(artifactDir, 'html-report'), open: 'never' }],
  ],

  outputDir: path.join(artifactDir, 'attachments'),
};
