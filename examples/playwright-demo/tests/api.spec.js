// @ts-check
const { test, expect, request } = require('@playwright/test');

/**
 * API tests using Playwright's request API against jsonplaceholder.typicode.com.
 * These test HTTP behavior without a browser, demonstrating Playwright's API testing capability.
 */

test.describe('JSONPlaceholder API — smoke tests', () => {
  let apiContext;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: 'https://jsonplaceholder.typicode.com',
      extraHTTPHeaders: { 'Accept': 'application/json' },
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('GET /posts returns an array of posts', async () => {
    const response = await apiContext.get('/posts');
    expect(response.status()).toBe(200);

    const posts = await response.json();
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);

    // Validate shape of first post
    const first = posts[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('body');
    expect(first).toHaveProperty('userId');
  });

  test('GET /posts/1 returns a single post', async () => {
    const response = await apiContext.get('/posts/1');
    expect(response.status()).toBe(200);

    const post = await response.json();
    expect(post.id).toBe(1);
    expect(typeof post.title).toBe('string');
    expect(post.title.length).toBeGreaterThan(0);
  });

  test('POST /posts creates a new resource', async () => {
    const response = await apiContext.post('/posts', {
      data: {
        title: 'SmokeStack test post',
        body: 'Posted by SmokeStack automated test',
        userId: 1,
      },
    });
    expect(response.status()).toBe(201);

    const created = await response.json();
    expect(created).toHaveProperty('id');
    expect(created.title).toBe('SmokeStack test post');
  });

  test('GET /users returns an array of users', async () => {
    const response = await apiContext.get('/users');
    expect(response.status()).toBe(200);

    const users = await response.json();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);

    const user = users[0];
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('email');
  });

  test('GET /posts?userId=1 filters by userId', async () => {
    const response = await apiContext.get('/posts?userId=1');
    expect(response.status()).toBe(200);

    const posts = await response.json();
    expect(Array.isArray(posts)).toBe(true);
    posts.forEach(post => {
      expect(post.userId).toBe(1);
    });
  });

  test('GET /posts/9999 returns 404 for non-existent resource', async () => {
    const response = await apiContext.get('/posts/9999');
    expect(response.status()).toBe(404);
  });
});
