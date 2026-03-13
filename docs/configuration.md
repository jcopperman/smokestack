# Configuration

SmokeStack is configured entirely through environment variables. Copy `.env.example` to `.env` and edit as needed, or set variables directly in `docker-compose.yml`.

---

## Environment variables

### Shared (postgres, redis)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://smokestack:smokestack@postgres:5432/smokestack` | PostgreSQL connection string. |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string. |

### API service

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the HTTP server listens on. |
| `ARTIFACT_DIR` | `/artifacts` | Filesystem path where artifact files are served from. Must match the volume mount. |

### Runner service

| Variable | Default | Description |
|---|---|---|
| `CONCURRENCY` | `2` | Number of test jobs the runner processes in parallel. Increase for faster throughput, decrease if memory is constrained. |
| `ARTIFACT_DIR` | `/artifacts` | Must match the API's `ARTIFACT_DIR` — both services share the same Docker volume. |
| `WEBHOOK_URL` | _(empty)_ | Webhook endpoint for run completion notifications. Leave empty to disable. |

---

## Slack notifications

Set `WEBHOOK_URL` to a Slack incoming webhook URL to receive a notification after every run:

```yaml
# docker-compose.yml
runner:
  environment:
    WEBHOOK_URL: "https://hooks.slack.com/services/T.../B.../..."
```

SmokeStack detects Slack URLs automatically by checking for `hooks.slack.com` and sends a Block Kit message:

```
✅ SmokeStack run PASSED — Playwright Demo
────────────────────────────────
Suite:       Playwright Demo
Environment: staging
Status:      ✅ passed
Results:     6 / 6 passed
Duration:    18.4s
Run ID:      550e8400
```

To create a webhook URL:
1. Go to **Slack → Apps → Incoming Webhooks → Add to Slack**.
2. Choose the channel and click **Add Incoming Webhooks Integration**.
3. Copy the **Webhook URL** and set it as `WEBHOOK_URL`.

### Generic webhooks

Any other URL is treated as a generic JSON webhook. SmokeStack sends a `POST` with:

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "suite": "playwright-demo",
  "environment": "staging",
  "status": "passed",
  "passed_tests": 6,
  "failed_tests": 0,
  "total_tests": 6,
  "duration_ms": 18420,
  "timestamp": "2026-03-13T08:00:18.000Z"
}
```

This is compatible with most alerting tools (PagerDuty, Opsgenie, custom handlers, etc.).

**Webhook behaviour:**
- Fires after every completed run (passed, failed, and error).
- Has a 5-second timeout. Failures are logged but never retry — notifications are best-effort and will not block or fail a run.
- HTTP and HTTPS are both supported.

---

## Runner concurrency

`CONCURRENCY` controls how many test jobs run simultaneously in the runner container.

| Value | Use case |
|---|---|
| `1` | Low-resource environments, or when tests must run serially. |
| `2` | Default. Suitable for most local and small server deployments. |
| `4–8` | High-throughput CI environments with enough CPU/RAM. |

If you scale runner replicas (e.g. in Kubernetes), each replica processes `CONCURRENCY` jobs, so total parallelism = `replicas × CONCURRENCY`.

---

## Persistent storage

Two Docker named volumes are used:

| Volume | Service | Contents |
|---|---|---|
| `postgres_data` | postgres | Database files — run records, logs, history. |
| `artifacts` | api + runner | HTML reports, JSON results, run logs. |

Both are preserved across `docker compose down`. To wipe everything and start fresh:

```bash
docker compose down -v
```

### Backing up artifacts

```bash
# Copy all artifacts out of the container
docker cp "$(docker compose ps -q api)":/artifacts ./artifacts-backup

# Or use the volume directly
docker run --rm -v smokestack_artifacts:/data -v $(pwd):/backup \
  alpine tar czf /backup/artifacts.tar.gz -C /data .
```

---

## External PostgreSQL

To use an existing PostgreSQL instance instead of the bundled container:

1. Remove the `postgres` service from `docker-compose.yml`.
2. Remove the `postgres` dependency from `api` and `runner`.
3. Set `DATABASE_URL` to your connection string on both services.
4. Run the schema manually:

```bash
psql $DATABASE_URL -f postgres/init.sql
```

The `init.sql` file is idempotent — safe to re-run on an existing database.

---

## External Redis

To use an existing Redis instance:

1. Remove the `redis` service and its `depends_on` entries.
2. Set `REDIS_URL` on `api` and `runner`.

---

## Production checklist

- [ ] Change `POSTGRES_PASSWORD` from `smokestack` to a strong secret.
- [ ] Use Docker secrets or a secrets manager for `DATABASE_URL` and `WEBHOOK_URL` — avoid committing `.env` to source control.
- [ ] Set `CONCURRENCY` based on available CPU/RAM.
- [ ] Mount `ARTIFACT_DIR` on durable storage (not an ephemeral container layer) — both api and runner must share the same path.
- [ ] Put the API behind a reverse proxy (nginx, Caddy) for TLS termination if exposing to the internet.
- [ ] For Kubernetes deployments, see `k8s/` for manifest examples.
