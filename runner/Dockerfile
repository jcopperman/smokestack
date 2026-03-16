# Build context: project root (so examples/ can be baked in for Kubernetes)
# Usage:
#   docker compose up --build          (handled automatically)
#   docker build -f runner/Dockerfile -t smokestack-runner:latest .

FROM mcr.microsoft.com/playwright:v1.42.0-jammy

# Tell Playwright where the pre-installed browsers live so it doesn't try to
# download them again at runtime.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Allow test files to import('@playwright/test') from the global install path.
# Without this, Node.js won't find globally-installed packages from /suites/* files.
ENV NODE_PATH=/usr/lib/node_modules

# Install the Playwright CLI and test runner globally, pinned to match the base
# image's browser version so PLAYWRIGHT_BROWSERS_PATH is honoured correctly.
# Also install Newman and its HTML reporter, and Jest + Pactum for API tests.
RUN npm install -g @playwright/test@1.42.0 newman newman-reporter-htmlextra jest pactum

# Install k6 for performance/load testing
RUN curl -L https://github.com/grafana/k6/releases/download/v0.54.0/k6-v0.54.0-linux-amd64.tar.gz \
    | tar xz --strip-components=1 -C /usr/local/bin k6-v0.54.0-linux-amd64/k6

WORKDIR /app

# Install all dependencies (devDeps needed for TypeScript compilation)
COPY runner/package.json runner/package-lock.json* runner/tsconfig.json ./
RUN npm install

# Copy source, compile TypeScript, then prune devDeps to keep image lean
COPY runner/src/ src/
RUN npm run build && npm prune --omit=dev

# Bake example suites into the image so the runner works in Kubernetes without
# needing a volume mount. In Docker Compose, ./examples is also bind-mounted
# over this at /suites, so local edits are still picked up immediately.
COPY examples/ /suites/

# Artifacts directory (overridden by the named volume / PVC at runtime)
RUN mkdir -p /artifacts

CMD ["node", "dist/worker.js"]
