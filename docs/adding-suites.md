# Adding Test Suites

This guide walks you through registering your own Playwright, Newman, or k6 suites with SmokeStack.

## How suites work

Each suite is:

1. **A directory of test files** mounted into the runner container at `/suites/<name>`.
2. **Two registry entries** — one in `api/src/suites.ts` (display metadata) and one in `runner/src/suites.ts` (execution config).

The runner executes suites as child processes using the installed test framework binary. Results are parsed from JSON output and stored in PostgreSQL.

---

## Step 1 — Add your test files

Create a directory under `examples/` (or anywhere, as long as you mount it):

```
examples/
└── my-suite/
    └── ...test files...
```

### Playwright

```
examples/my-playwright-suite/
├── playwright.config.ts
├── package.json           ← optional; global playwright binary is used
└── tests/
    ├── login.spec.ts
    └── checkout.spec.ts
```

The runner calls `playwright test` in the suite's directory. Your `playwright.config.ts` **must** write its JSON and HTML reports to `process.env.ARTIFACT_DIR`:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import path from 'path';

const artifactDir = process.env.ARTIFACT_DIR ?? path.join(__dirname, 'test-results');

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['json', { outputFile: path.join(artifactDir, 'results.json') }],
    ['html', { outputFolder: path.join(artifactDir, 'html-report'), open: 'never' }],
  ],
});
```

### Newman

```
examples/my-newman-suite/
├── collection.json        ← Postman collection (exported from Postman)
└── environment.json       ← optional: Postman environment file
```

Export your collection from Postman: **Collection → ⋯ → Export → Collection v2.1**.

The runner calls:
```
newman run collection.json \
  --reporters cli,json,htmlextra \
  --reporter-json-export <artifactDir>/results.json \
  --reporter-htmlextra-export <artifactDir>/report.html \
  [--environment environment.json]
```

### k6

```
examples/my-k6-suite/
└── script.js
```

Your `script.js` must implement `handleSummary` to write `summary.json` — this is how SmokeStack reads pass/fail counts:

```javascript
export function handleSummary(data) {
  const dir = __ENV.ARTIFACT_DIR || '/tmp';
  return {
    [`${dir}/summary.json`]: JSON.stringify(data),
    stdout: '\n' + JSON.stringify(data.metrics.checks?.values) + '\n',
  };
}
```

SmokeStack passes `ARTIFACT_DIR` via `-e ARTIFACT_DIR=<path>`. The runner reads `checks.values.passes` and `checks.values.fails` from `summary.json`.

---

## Step 2 — Register in the API suite registry

Edit `api/src/suites.ts` and add an entry:

```typescript
// api/src/suites.ts
'my-playwright-suite': {
  id:                   'my-playwright-suite',
  name:                 'My Login Suite',
  description:          'Smoke tests for login and checkout flows',
  type:                 'playwright',
  estimatedDurationSecs: 45,
  tags:                 ['smoke', 'e2e', 'auth'],
},
```

**Fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Must match the key exactly. Used in API calls. |
| `name` | string | Display name shown in the dashboard. |
| `description` | string | One-line description shown in the modal and Suites view. |
| `type` | `'playwright' \| 'newman' \| 'k6'` | Determines which executor is used. |
| `estimatedDurationSecs` | number | Informational only — not enforced. |
| `tags` | string[] | Used for filtering in the dashboard and API. |

---

## Step 3 — Register in the runner suite registry

Edit `runner/src/suites.ts` and add the execution config:

```typescript
// runner/src/suites.ts
'my-playwright-suite': {
  type: 'playwright',
  cwd:  '/suites/my-playwright-suite',
},
```

**Fields:**

| Field | Description |
|---|---|
| `type` | Must match the API registry entry. |
| `cwd` | Absolute path inside the runner container where tests are located. |

The `cwd` path must correspond to the volume mount. By default, `./examples` is mounted to `/suites`:

```yaml
# docker-compose.yml
volumes:
  - ./examples:/suites:ro
```

If your suites live in a different directory, add a volume mount:

```yaml
runner:
  volumes:
    - artifacts:/artifacts
    - ./examples:/suites:ro
    - /path/to/my-suites:/my-suites:ro   ← add this
```

Then use `/my-suites/my-suite` as the `cwd`.

---

## Step 4 — Rebuild and test

```bash
docker compose up --build
```

Your new suite will appear in the **New Run** modal and on the **Suites** page.

---

## Using environment variables in tests

When triggering a run you can pass arbitrary key/value pairs via the dashboard or API. These are available inside your tests as regular environment variables (Playwright, Newman) or via `__ENV` (k6).

### Playwright / Newman

Environment variables are merged into `process.env` of the spawned process:

```typescript
// tests/my.spec.ts
const baseUrl = process.env.BASE_URL ?? 'https://staging.example.com';
```

Trigger with:
```json
POST /api/runs
{
  "suite": "my-playwright-suite",
  "environment": "staging",
  "env": { "BASE_URL": "https://staging.example.com" }
}
```

### k6

k6 reads env vars from `-e` flags, not `process.env`. SmokeStack passes them automatically:

```javascript
// script.js
const BASE_URL = __ENV.BASE_URL || 'https://staging.example.com';
```

---

## Tags

Tags let you filter suites and runs in the dashboard. Use them to group suites by purpose:

| Tag | Meaning |
|---|---|
| `smoke` | Quick checks to verify the system is up |
| `e2e` | Full user-journey browser tests |
| `api` | HTTP-level API tests |
| `browser` | Tests that require a browser |
| `performance` | Load or stress tests |
| `load` | k6 or similar load tests |
| `regression` | Full regression suites |
| `auth` | Authentication-related tests |

Tags are free-form strings — define your own taxonomy.

---

## Troubleshooting

**Suite doesn't appear in the modal**
Verify the entry exists in `api/src/suites.ts` and the container has been rebuilt (`docker compose up --build`).

**Run immediately shows `error`**
Check the run log — the most common causes are:
- The `cwd` path is wrong (directory doesn't exist inside the container).
- The test framework binary isn't installed in the runner image.
- `results.json` / `summary.json` wasn't written to `ARTIFACT_DIR`.

**k6 results show `—` for pass/fail counts**
Ensure `handleSummary` writes to `${__ENV.ARTIFACT_DIR}/summary.json`. Without this file, the runner cannot parse results.

**Newman environment variables not applied**
Pass them via the run's `env` field, not via a Postman environment file — or add them to `environment.json` and commit the file.
