import { test, expect } from '@playwright/test';

/**
 * Smoke tests for playwright.dev — tests the official Playwright documentation site.
 * These verify basic navigation and content, making them a reliable demo
 * because Microsoft maintains this site.
 */

test.describe('Playwright.dev — smoke tests', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.goto('https://playwright.dev');
    await expect(page).toHaveTitle(/Playwright/);
  });

  test('homepage has a "Get started" call to action', async ({ page }) => {
    await page.goto('https://playwright.dev');
    const getStarted = page.getByRole('link', { name: /get started/i });
    await expect(getStarted).toBeVisible();
  });

  test('"Get started" link navigates to installation docs', async ({ page }) => {
    await page.goto('https://playwright.dev');
    await page.getByRole('link', { name: /get started/i }).first().click();
    await expect(page).toHaveURL(/docs\/intro/);
    await expect(page.getByRole('heading', { name: /installation/i })).toBeVisible();
  });

  test('docs navigation sidebar is present', async ({ page }) => {
    await page.goto('https://playwright.dev/docs/intro');
    const sidebar = page
      .locator('nav[class*="sidebar"], aside[class*="sidebar"], .theme-doc-sidebar-container')
      .first();
    await expect(sidebar).toBeVisible();
  });

  test('search is accessible via keyboard shortcut', async ({ page }) => {
    await page.goto('https://playwright.dev');
    await page.keyboard.press('Control+K');
    const searchInput = page
      .locator('[placeholder*="search" i], [aria-label*="search" i], input[type="search"]')
      .first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });
});
