# Quickstart

Get SmokeStack running locally in under five minutes.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Compose)
- Git

## 1. Clone and start

```bash
git clone https://github.com/jcopperman/smokestack.git
cd smokestack
docker compose up --build
```

Docker Compose starts four containers: `postgres`, `redis`, `api`, and `runner`. On first boot, PostgreSQL initialises the schema automatically from `postgres/init.sql`.

## 2. Open the dashboard

Navigate to **http://localhost:3000** in your browser.

## 3. Trigger your first run

1. Click **▶ New Run** in the top-right corner.
2. Select a suite from the dropdown — three demo suites are included out of the box:

   | Suite | Type | What it tests |
   |---|---|---|
   | Playwright Demo | E2E browser | playwright.dev navigation |
   | Newman API Demo | API | jsonplaceholder REST API |
   | k6 Performance Demo | Load | jsonplaceholder, 5 VUs staged ramp |

3. Leave **Environment** as `staging` (or type any label — it is stored for reference only).
4. Click **▶ Run Suite**.

The run appears immediately with a `queued` badge and transitions to `running`, then `passed` or `failed`.

## 4. View results

Click any row in the **Runs** table to open the detail view. From there you can:

- Watch the live output log stream while a run is in progress.
- Download the **HTML Report** (Playwright and Newman), raw **JSON Results**, or **Run Log**.
- See which tests passed and failed, plus total duration.

## 5. Stop the stack

```bash
docker compose down
```

Add `-v` to also remove the PostgreSQL volume (clears all run history and artifacts):

```bash
docker compose down -v
```

## What's running

```
localhost:3000  →  SmokeStack API + Dashboard
localhost:5432  →  PostgreSQL 16  (run records)
localhost:6379  →  Redis 7        (job queue)
```

The runner container has no exposed port — it connects internally to Redis to consume jobs.

## Next steps

- **Add your own suites** — see [Adding Test Suites](./adding-suites.md)
- **Configure notifications** — see [Configuration](./configuration.md)
- **Integrate with CI/CD** — see [CI/CD Integration](./cicd-integration.md)
- **Full API reference** — see [API Reference](./api-reference.md)
