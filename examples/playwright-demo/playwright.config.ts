import { defineConfig } from '@playwright/test';
import path from 'path';

const artifactDir = process.env.ARTIFACT_DIR
  ? path.join(process.env.ARTIFACT_DIR)
  : path.join(__dirname, 'test-results');

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  workers: 1,

  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  reporter: [
    ['list'],
    ['json', { outputFile: path.join(artifactDir, 'results.json') }],
    ['html', { outputFolder: path.join(artifactDir, 'html-report'), open: 'never' }],
  ],

  outputDir: path.join(artifactDir, 'attachments'),
});
