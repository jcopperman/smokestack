# API Reference

All endpoints are served on port `3000` by default. The base path is `/api`.

---

## Health

### `GET /api/health`

Returns the service status and current timestamp. Use this to verify the API is reachable.

**Response `200`**
```json
{
  "status": "ok",
  "timestamp": "2026-03-13T08:00:00.000Z"
}
```

---

## Runs

### `POST /api/runs` — Trigger a run

Queue a new test run. Returns immediately with the new run record — execution happens asynchronously.

**Request body**

```json
{
  "suite": "playwright-demo",
  "environment": "staging",
  "env": {
    "BASE_URL": "https://staging.example.com",
    "API_KEY": "abc123"
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `suite` | string | Yes | Suite ID. Must match a key in the suite registry. |
| `environment` | string | No | Free-form label stored on the run (default: `"default"`). |
| `env` | object | No | Key/value pairs injected as environment variables into the test process. Values must be strings. |

**Response `201`**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "suite": "playwright-demo",
  "environment": "staging",
  "status": "queued",
  "env_vars": { "BASE_URL": "https://staging.example.com" },
  "created_at": "2026-03-13T08:00:00.000Z"
}
```

**Error responses**

| Status | Reason |
|---|---|
| `400` | `suite` is missing or not a registered suite ID. |
| `500` | Database or queue error. |

---

### `GET /api/runs` — List runs

Returns a paginated list of runs ordered by `created_at DESC`.

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `50` | Number of runs to return. Max `200`. |
| `offset` | integer | `0` | Pagination offset. |
| `status` | string | — | Filter by status: `queued`, `running`, `passed`, `failed`, or `error`. |

**Examples**

```bash
# Most recent 50 runs
GET /api/runs

# Page 2 (runs 51–100)
GET /api/runs?limit=50&offset=50

# Only failed runs
GET /api/runs?status=failed

# Active runs only
GET /api/runs?status=running
```

**Response `200`**
```json
{
  "runs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "suite": "playwright-demo",
      "environment": "staging",
      "status": "passed",
      "total_tests": 6,
      "passed_tests": 6,
      "failed_tests": 0,
      "duration_ms": 18420,
      "artifact_path": "550e8400-e29b-41d4-a716-446655440000",
      "error_message": null,
      "env_vars": {},
      "created_at": "2026-03-13T08:00:00.000Z",
      "updated_at": "2026-03-13T08:00:18.000Z"
    }
  ],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

---

### `GET /api/runs/:id` — Get a single run

**Path parameter:** `id` — UUID of the run.

**Response `200`** — same shape as a single object from the `runs` array above.

**Response `404`** — run not found.

---

### `GET /api/runs/:id/logs` — Get run log output

Returns the captured stdout/stderr from the test process. The log is truncated to the last 100,000 characters for very long outputs.

**Response `200`**
```json
{
  "log_output": "[2026-03-13T08:00:01.000Z] ▶ playwright test\n\n  ✓ homepage loads...",
  "status": "passed"
}
```

`log_output` may be an empty string while the run is `queued`. Poll this endpoint alongside `GET /api/runs/:id` to display a live log stream.

---

## Suites

### `GET /api/suites` — List all suites

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `tag` | string | Filter suites by tag. Returns only suites whose `tags` array includes this value. |

**Examples**

```bash
# All suites
GET /api/suites

# Suites tagged 'smoke'
GET /api/suites?tag=smoke

# Suites tagged 'performance'
GET /api/suites?tag=performance
```

**Response `200`**
```json
[
  {
    "id": "playwright-demo",
    "name": "Playwright Demo",
    "description": "End-to-end browser tests using Playwright against playwright.dev",
    "type": "playwright",
    "estimatedDurationSecs": 30,
    "tags": ["smoke", "e2e", "browser"]
  },
  {
    "id": "newman-demo",
    "name": "Newman API Demo",
    "description": "API tests using Newman against jsonplaceholder.typicode.com",
    "type": "newman",
    "estimatedDurationSecs": 15,
    "tags": ["smoke", "api"]
  },
  {
    "id": "k6-demo",
    "name": "k6 Performance Demo",
    "description": "Load test against jsonplaceholder.typicode.com — 5 VUs, staged ramp",
    "type": "k6",
    "estimatedDurationSecs": 40,
    "tags": ["performance", "load"]
  }
]
```

---

### `GET /api/suites/:id/history` — Suite run history

Returns the last N completed runs for a suite, with a calculated `pass_rate` field. Useful for building trend charts or health dashboards.

**Path parameter:** `id` — suite ID.

**Query parameters**

| Parameter | Type | Default | Max |
|---|---|---|---|
| `limit` | integer | `20` | `100` |

**Response `200`**
```json
{
  "suite": "playwright-demo",
  "history": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "passed",
      "passed_tests": 6,
      "failed_tests": 0,
      "total_tests": 6,
      "duration_ms": 18420,
      "created_at": "2026-03-13T08:00:00.000Z",
      "pass_rate": 1.0
    },
    {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "status": "failed",
      "passed_tests": 4,
      "failed_tests": 2,
      "total_tests": 6,
      "duration_ms": 22100,
      "created_at": "2026-03-12T22:00:00.000Z",
      "pass_rate": 0.6667
    }
  ]
}
```

`pass_rate` is `passed_tests / total_tests` (0.0–1.0), or `null` if `total_tests` is 0.

**Response `404`** — suite ID not found.

---

## Artifacts

Artifacts are served directly from the filesystem — they are not JSON API responses.

```
GET /artifacts/:runId/run.log
GET /artifacts/:runId/results.json
GET /artifacts/:runId/html-report/index.html   ← Playwright only
GET /artifacts/:runId/report.html              ← Newman only
GET /artifacts/:runId/summary.json             ← k6 only
```

`runId` is the UUID of the run (same as `artifact_path` on the run record).

---

## Run lifecycle

```
queued  →  running  →  passed
                    →  failed
                    →  error
```

| Status | Meaning |
|---|---|
| `queued` | Accepted by the API, waiting for a runner worker to pick it up. |
| `running` | Runner has started executing the test process. |
| `passed` | All tests passed (exit code 0 and zero failed tests). |
| `failed` | One or more tests failed, or the process exited non-zero. |
| `error` | Suite not found, spawn failure, or unhandled exception in the runner. |

---

## Polling pattern for CI/CD

```bash
# 1. Trigger a run
RUN_ID=$(curl -sf -X POST http://localhost:3000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"suite":"playwright-demo","environment":"staging"}' \
  | jq -r .id)

echo "Run started: $RUN_ID"

# 2. Poll until complete
while true; do
  STATUS=$(curl -sf http://localhost:3000/api/runs/$RUN_ID | jq -r .status)
  echo "Status: $STATUS"
  case $STATUS in
    passed) echo "Tests passed"; exit 0 ;;
    failed|error) echo "Tests failed"; exit 1 ;;
    *) sleep 5 ;;
  esac
done
```

See [CI/CD Integration](./cicd-integration.md) for ready-made GitHub Actions and GitLab CI examples.
