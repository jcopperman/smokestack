import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metric: tracks the overall HTTP error rate across all requests
const errorRate = new Rate('errors');

export const options = {
  // Staged load: ramp up → hold → ramp down
  stages: [
    { duration: '10s', target: 5 },  // ramp up to 5 virtual users
    { duration: '20s', target: 5 },  // hold at 5 VUs
    { duration: '5s',  target: 0 },  // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95th percentile response time under 2s
    http_req_failed:   ['rate<0.05'],   // HTTP error rate under 5%
    checks:            ['rate>0.95'],   // at least 95% of all checks must pass
  },
};

export default function () {
  // ── Request 1: fetch a single post ────────────────────────────────────────
  const post = http.get('https://jsonplaceholder.typicode.com/posts/1');
  const postOk = check(post, {
    'GET /posts/1 — status 200':    (r) => r.status === 200,
    'GET /posts/1 — has title':     (r) => !!JSON.parse(r.body).title,
    'GET /posts/1 — response < 2s': (r) => r.timings.duration < 2000,
  });
  errorRate.add(!postOk);

  // ── Request 2: fetch the users list ───────────────────────────────────────
  const users = http.get('https://jsonplaceholder.typicode.com/users');
  const usersOk = check(users, {
    'GET /users — status 200':  (r) => r.status === 200,
    'GET /users — 10 results':  (r) => JSON.parse(r.body).length === 10,
    'GET /users — has email':   (r) => !!JSON.parse(r.body)[0].email,
  });
  errorRate.add(!usersOk);

  // ── Request 3: create a post ──────────────────────────────────────────────
  const payload = JSON.stringify({ title: 'k6 test', body: 'load test run', userId: 1 });
  const created = http.post('https://jsonplaceholder.typicode.com/posts', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  const createdOk = check(created, {
    'POST /posts — status 201':  (r) => r.status === 201,
    'POST /posts — has id':      (r) => !!JSON.parse(r.body).id,
  });
  errorRate.add(!createdOk);

  sleep(1);
}

// handleSummary replaces the removed --summary-export flag (dropped in k6 v0.46).
// SmokeStack passes ARTIFACT_DIR via -e so we can write summary.json to the right place.
// The returned data object has the same metrics.checks.values structure that parseK6Results expects.
export function handleSummary(data) {
  const dir     = __ENV.ARTIFACT_DIR || '/tmp';
  const checks  = data.metrics.checks ? data.metrics.checks.values : { passes: 0, fails: 0 };
  const p95     = data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'].toFixed(1) : '?';
  const reqs    = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : '?';

  return {
    [`${dir}/summary.json`]: JSON.stringify(data),
    stdout: `\nChecks: ${checks.passes} passed, ${checks.fails} failed | p(95) latency: ${p95}ms | total requests: ${reqs}\n`,
  };
}
