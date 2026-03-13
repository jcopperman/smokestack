# Use the official Playwright image which includes Chromium, Firefox, WebKit
# and all required system dependencies.
FROM mcr.microsoft.com/playwright:v1.42.0-jammy

# Tell Playwright where the pre-installed browsers live so it doesn't try to
# download them again at runtime.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Allow test files to require('@playwright/test') from the global install path.
# Without this, Node.js won't find globally-installed packages from /suites/* files.
ENV NODE_PATH=/usr/lib/node_modules

# Install the Playwright CLI and test runner globally, pinned to match the base
# image's browser version so PLAYWRIGHT_BROWSERS_PATH is honoured correctly.
# Also install Newman and its HTML reporter.
RUN npm install -g @playwright/test@1.42.0 newman newman-reporter-htmlextra

WORKDIR /app

# Install runner dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy runner source
COPY src/ src/

# Artifacts directory (will be overridden by the named volume in docker-compose)
RUN mkdir -p /artifacts

CMD ["node", "src/worker.js"]
