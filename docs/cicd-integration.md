# CI/CD Integration

Use SmokeStack as a release gate in your pipeline. Trigger a run via the REST API, poll until it completes, and fail the pipeline if tests fail.

---

## Pattern overview

```
Pipeline step
  │
  ├─ POST /api/runs  →  captures run ID
  │
  └─ loop: GET /api/runs/:id
        ├─ status = queued/running  →  wait 5s, repeat
        ├─ status = passed          →  exit 0  (pipeline continues)
        └─ status = failed/error    →  exit 1  (pipeline blocked)
```

---

## GitHub Actions

### Basic smoke gate

```yaml
# .github/workflows/release-gate.yml
name: Smoke gate

on:
  push:
    branches: [main]

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger SmokeStack run
        env:
          SMOKESTACK: ${{ secrets.SMOKESTACK_URL }}
        run: |
          RUN_ID=$(curl -sf -X POST "$SMOKESTACK/api/runs" \
            -H 'Content-Type: application/json' \
            -d '{"suite":"playwright-demo","environment":"staging"}' \
            | jq -r .id)

          echo "Run ID: $RUN_ID"
          echo "Dashboard: $SMOKESTACK/#/runs/$RUN_ID"

          while true; do
            STATUS=$(curl -sf "$SMOKESTACK/api/runs/$RUN_ID" | jq -r .status)
            echo "Status: $STATUS"
            case $STATUS in
              passed) echo "Tests passed ✓"; exit 0 ;;
              failed|error) echo "Tests failed ✗"; exit 1 ;;
            esac
            sleep 5
          done
```

Set `SMOKESTACK_URL` as a [repository secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets) — e.g. `https://smokestack.internal.example.com`.

### With environment variables passed to tests

```yaml
- name: Trigger SmokeStack run
  env:
    SMOKESTACK: ${{ secrets.SMOKESTACK_URL }}
    DEPLOY_URL: ${{ steps.deploy.outputs.url }}
  run: |
    RUN_ID=$(curl -sf -X POST "$SMOKESTACK/api/runs" \
      -H 'Content-Type: application/json' \
      -d "{
        \"suite\": \"playwright-demo\",
        \"environment\": \"pr-${{ github.event.number }}\",
        \"env\": {
          \"BASE_URL\": \"$DEPLOY_URL\",
          \"BRANCH\": \"${{ github.head_ref }}\"
        }
      }" | jq -r .id)
    # ... poll loop as above
```

### Nightly regression

```yaml
name: Nightly regression

on:
  schedule:
    - cron: '0 2 * * *'   # 2am UTC every night

jobs:
  regression:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        suite: [playwright-demo, newman-demo, k6-demo]
    steps:
      - name: Run ${{ matrix.suite }}
        env:
          SMOKESTACK: ${{ secrets.SMOKESTACK_URL }}
        run: |
          RUN_ID=$(curl -sf -X POST "$SMOKESTACK/api/runs" \
            -H 'Content-Type: application/json' \
            -d "{\"suite\":\"${{ matrix.suite }}\",\"environment\":\"production\"}" \
            | jq -r .id)

          while true; do
            STATUS=$(curl -sf "$SMOKESTACK/api/runs/$RUN_ID" | jq -r .status)
            case $STATUS in
              passed) exit 0 ;;
              failed|error) exit 1 ;;
            esac
            sleep 5
          done
```

---

## GitLab CI

```yaml
# .gitlab-ci.yml
smoke-gate:
  stage: test
  image: alpine:latest
  before_script:
    - apk add --no-cache curl jq
  script:
    - |
      RUN_ID=$(curl -sf -X POST "$SMOKESTACK_URL/api/runs" \
        -H 'Content-Type: application/json' \
        -d "{\"suite\":\"playwright-demo\",\"environment\":\"staging\"}" \
        | jq -r .id)

      echo "Run: $SMOKESTACK_URL/#/runs/$RUN_ID"

      while true; do
        STATUS=$(curl -sf "$SMOKESTACK_URL/api/runs/$RUN_ID" | jq -r .status)
        echo "Status: $STATUS"
        [ "$STATUS" = "passed" ] && exit 0
        [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ] && exit 1
        sleep 5
      done
  variables:
    SMOKESTACK_URL: $SMOKESTACK_URL   # set in GitLab CI/CD variables
```

---

## Bitbucket Pipelines

```yaml
# bitbucket-pipelines.yml
pipelines:
  default:
    - step:
        name: Smoke tests
        image: alpine:latest
        script:
          - apk add --no-cache curl jq
          - |
            RUN_ID=$(curl -sf -X POST "$SMOKESTACK_URL/api/runs" \
              -H 'Content-Type: application/json' \
              -d '{"suite":"newman-demo","environment":"staging"}' \
              | jq -r .id)
            while true; do
              STATUS=$(curl -sf "$SMOKESTACK_URL/api/runs/$RUN_ID" | jq -r .status)
              [ "$STATUS" = "passed" ] && exit 0
              [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ] && exit 1
              sleep 5
            done
```

---

## Shell script (reusable)

Save this as `scripts/smoke-gate.sh` and call it from any pipeline:

```bash
#!/usr/bin/env bash
# Usage: ./smoke-gate.sh <suite> <environment> [base_url]
set -euo pipefail

SMOKESTACK="${SMOKESTACK_URL:?SMOKESTACK_URL is required}"
SUITE="${1:?suite is required}"
ENV="${2:-staging}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"
TIMEOUT="${TIMEOUT:-300}"   # 5 minutes

echo "Triggering $SUITE on $ENV..."

BODY="{\"suite\":\"$SUITE\",\"environment\":\"$ENV\"}"
RUN_ID=$(curl -sf -X POST "$SMOKESTACK/api/runs" \
  -H 'Content-Type: application/json' \
  -d "$BODY" | jq -r .id)

echo "Run ID : $RUN_ID"
echo "Details: $SMOKESTACK/#/runs/$RUN_ID"

ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  RESPONSE=$(curl -sf "$SMOKESTACK/api/runs/$RUN_ID")
  STATUS=$(echo "$RESPONSE" | jq -r .status)
  echo "[${ELAPSED}s] Status: $STATUS"

  case $STATUS in
    passed)
      PASSED=$(echo "$RESPONSE" | jq -r '.passed_tests // "?"')
      TOTAL=$(echo "$RESPONSE" | jq -r '.total_tests // "?"')
      DURATION=$(echo "$RESPONSE" | jq -r 'if .duration_ms then (.duration_ms / 1000 | tostring) + "s" else "?" end')
      echo "✓ Passed ($PASSED/$TOTAL tests in $DURATION)"
      exit 0
      ;;
    failed|error)
      ERROR=$(echo "$RESPONSE" | jq -r '.error_message // "see run log"')
      echo "✗ Failed: $ERROR"
      exit 1
      ;;
  esac

  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

echo "✗ Timed out after ${TIMEOUT}s"
exit 1
```

Usage:
```bash
chmod +x scripts/smoke-gate.sh
SMOKESTACK_URL=https://smokestack.internal ./scripts/smoke-gate.sh playwright-demo staging
```

---

## Triggering with specific tags

You can query suites by tag before triggering runs — useful when you want to run all `smoke` suites across environments:

```bash
# Get all smoke suite IDs
SMOKE_SUITES=$(curl -sf "$SMOKESTACK_URL/api/suites?tag=smoke" | jq -r '.[].id')

# Trigger them all
for SUITE in $SMOKE_SUITES; do
  echo "Triggering $SUITE..."
  curl -sf -X POST "$SMOKESTACK_URL/api/runs" \
    -H 'Content-Type: application/json' \
    -d "{\"suite\":\"$SUITE\",\"environment\":\"staging\"}" | jq .id
done
```

---

## Sharing results in pull requests

After a run completes, link the SmokeStack result in your PR description or as a comment:

```bash
# In a GitHub Actions step after polling completes:
echo "## Test Results" >> $GITHUB_STEP_SUMMARY
echo "" >> $GITHUB_STEP_SUMMARY
echo "| Suite | Status | Results | Duration |" >> $GITHUB_STEP_SUMMARY
echo "|---|---|---|---|" >> $GITHUB_STEP_SUMMARY

RESPONSE=$(curl -sf "$SMOKESTACK/api/runs/$RUN_ID")
STATUS=$(echo $RESPONSE | jq -r .status)
PASSED=$(echo $RESPONSE | jq -r '.passed_tests // "-"')
TOTAL=$(echo $RESPONSE | jq -r '.total_tests // "-"')
DURATION=$(echo $RESPONSE | jq -r 'if .duration_ms then (.duration_ms/1000|tostring)+"s" else "-" end')

echo "| playwright-demo | $STATUS | $PASSED/$TOTAL | $DURATION |" >> $GITHUB_STEP_SUMMARY
echo "" >> $GITHUB_STEP_SUMMARY
echo "[View full run →]($SMOKESTACK/#/runs/$RUN_ID)" >> $GITHUB_STEP_SUMMARY
```

---

## Tips

- **Artifact links**: After a run, `artifact_path` on the run record equals the run UUID. HTML reports are at `/artifacts/<runId>/html-report/index.html` (Playwright) or `/artifacts/<runId>/report.html` (Newman).
- **Parallel suites**: Trigger multiple runs with separate `POST` calls and poll each `RUN_ID` concurrently. The runner processes `CONCURRENCY` jobs at a time.
- **Timeout**: Set a reasonable `TIMEOUT` in your polling script — default `5m` is usually sufficient. If a run stays `running` past the timeout, check the runner logs.
- **Idempotent environment labels**: Use `environment` to record meaningful context — branch names, PR numbers, version tags — to make run history searchable.
