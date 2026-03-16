const pactum = require('pactum');

/**
 * API smoke tests using Pactum against jsonplaceholder.typicode.com.
 * Demonstrates Pactum's fluent spec API for request/response validation.
 */

beforeAll(() => {
  pactum.request.setBaseUrl('https://jsonplaceholder.typicode.com');
});

describe('JSONPlaceholder API — pactum smoke tests', () => {
  describe('Posts', () => {
    it('GET /posts returns 200 with an array of posts', async () => {
      await pactum.spec()
        .get('/posts')
        .expectStatus(200)
        .expectJsonLength(100)
        .expectJsonLike([{ id: 1, userId: 1 }]);
    });

    it('GET /posts/1 returns the first post', async () => {
      await pactum.spec()
        .get('/posts/1')
        .expectStatus(200)
        .expectJsonLike({ id: 1 })
        .expectJsonSchema({
          type: 'object',
          required: ['id', 'userId', 'title', 'body'],
          properties: {
            id:     { type: 'number' },
            userId: { type: 'number' },
            title:  { type: 'string' },
            body:   { type: 'string' },
          },
        });
    });

    it('GET /posts?userId=1 filters posts by userId', async () => {
      await pactum.spec()
        .get('/posts')
        .withQueryParams('userId', '1')
        .expectStatus(200)
        .expectJsonLike([{ userId: 1 }])
        .expect((ctx) => {
          const posts = ctx.res.json;
          if (!Array.isArray(posts) || posts.length === 0) {
            throw new Error('Expected a non-empty array of posts');
          }
          for (const post of posts) {
            if (post.userId !== 1) throw new Error(`Unexpected userId: ${post.userId}`);
          }
        });
    });

    it('POST /posts creates a new resource', async () => {
      await pactum.spec()
        .post('/posts')
        .withJson({
          title: 'SmokeStack pactum test',
          body: 'Posted by SmokeStack automated test',
          userId: 1,
        })
        .expectStatus(201)
        .expectJsonLike({
          title: 'SmokeStack pactum test',
          userId: 1,
        })
        .expectJsonSchema({
          type: 'object',
          required: ['id'],
        });
    });

    it('GET /posts/9999 returns 404 for a non-existent post', async () => {
      await pactum.spec()
        .get('/posts/9999')
        .expectStatus(404);
    });
  });

  describe('Users', () => {
    it('GET /users returns 200 with an array of users', async () => {
      await pactum.spec()
        .get('/users')
        .expectStatus(200)
        .expectJsonSchema({
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'email'],
          },
        });
    });

    it('GET /users/1 returns the first user', async () => {
      await pactum.spec()
        .get('/users/1')
        .expectStatus(200)
        .expectJsonLike({ id: 1 })
        .expectJsonSchema({
          type: 'object',
          required: ['id', 'name', 'username', 'email'],
        });
    });
  });
});
