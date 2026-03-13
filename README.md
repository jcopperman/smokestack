# SmokeStack – Lightweight QA Execution Platform

SmokeStack is a lightweight, containerized QA execution platform designed to run automated test suites on demand and provide centralized reporting. It demonstrates how modern testing workloads can be executed using containerized runners and orchestrated with Kubernetes.

The goal of this project is to provide a simple but realistic QA infrastructure stack that can:

* Run automated test suites on demand
* Execute tests inside isolated containers
* Store test results and artifacts
* Provide a dashboard for viewing runs and results
* Scale test runners using container orchestration
* Run locally via Docker Compose or on Kubernetes

This project is intentionally minimal and focuses on **execution and infrastructure**, not test case management.

---

# Core Features

SmokeStack provides a small but practical set of capabilities.

Test execution

* Trigger test runs via API or UI
* Execute tests inside isolated containers
* Support Playwright, Newman, or other CLI-based frameworks

Result tracking

* Store test run metadata
* Track pass/fail status and durations
* Link to artifacts and reports

Artifacts

* Store test reports, screenshots, and logs
* Support Playwright HTML reports
* Support JUnit XML and JSON output

Dashboard

* View recent runs
* See pass/fail summaries
* Access logs and artifacts

Infrastructure

* Dockerized services
* Queue-based execution
* Kubernetes job runners
* Observability support

---

# Architecture

SmokeStack is built as a small microservice-style platform.

User / CI Pipeline
↓
QA Control API
↓
Redis Queue
↓
Test Runner Worker
↓
Artifacts + Postgres
↓
Dashboard UI

The platform separates **control logic** from **execution**, allowing test runs to scale independently.

---

# Components

API Service

Handles requests to trigger test runs and query results.

Responsibilities

* Receive execution requests
* Enqueue jobs
* Track run status
* Expose REST API

Technologies

* Node.js + Express or NestJS
* PostgreSQL client
* Redis queue client

---

Runner Worker

Executes test suites inside containers.

Responsibilities

* Pull test suite
* Execute framework commands
* Upload artifacts
* Persist results

Supported frameworks

* Playwright
* Cypress
* Newman
* PactumJS
* k6 (future)

Each execution runs inside an isolated container.

---

Redis Queue

Used to manage execution jobs and prevent API blocking.

Responsibilities

* Queue test execution requests
* Manage worker concurrency
* Retry failed jobs

Suggested library

* BullMQ (Node)

---

PostgreSQL

Stores metadata about test runs.

Example stored data

* run_id
* suite_name
* environment
* start_time
* end_time
* duration
* status
* artifact_path

---

Artifact Storage

Stores execution output.

Artifacts may include

* HTML reports
* screenshots
* logs
* video recordings
* JUnit XML results

Initial implementation uses mounted volumes.
Future versions may support object storage (S3 or MinIO).

---

Dashboard UI

Provides a simple interface for viewing test activity.

Capabilities

* trigger test runs
* view recent runs
* inspect logs
* download reports
* view pass/fail history

Suggested stack

* React
* Next.js
* or simple server-rendered pages

---

# Kubernetes Execution Model

SmokeStack uses Kubernetes Jobs for executing test runs.

Workflow

1. User triggers test suite
2. API creates Kubernetes Job
3. Job launches runner container
4. Runner executes test suite
5. Results and artifacts are stored
6. Job exits

Benefits

* clean execution environments
* scalable runners
* isolated failures
* reproducible results

---

# Technology Stack

Backend
Node.js
Express or NestJS

Runner
Playwright
Newman

Database
PostgreSQL

Queue
Redis
BullMQ

UI
React or Next.js

Infrastructure
Docker
Docker Compose
Kubernetes
Helm (optional)

Observability
Prometheus
Grafana

CI/CD
GitHub Actions

---

# Running Locally

The platform can run entirely on a local machine.

Requirements

Docker
Docker Compose
Node.js (optional for development)

Start the stack

docker compose up

This launches

* API service
* UI
* Postgres
* Redis
* test runner container

The dashboard becomes available at

http://localhost:3000

---

# Running on Kubernetes

For local Kubernetes development, a cluster can be created with kind.

Create cluster

kind create cluster --name smokestack

Deploy services

kubectl apply -f k8s/

Check pods

kubectl get pods

Expose UI

kubectl port-forward service/smokestack-ui 8080:80

Open browser

http://localhost:8080

---

# Example API Usage

Trigger a smoke suite

POST /runs

Request

{
"suite": "smoke",
"environment": "staging"
}

Response

{
"run_id": "abc123",
"status": "queued"
}

Check run status

GET /runs/{run_id}

---

# Example Project Structure

smokestack/

api/

runner/

dashboard/

docker/

k8s/

artifacts/

reports/

docker-compose.yml

README.md

---

# Roadmap

Phase 1 – Core execution

* Trigger test runs
* Execute runner container
* Store results
* Basic dashboard

Phase 2 – QA functionality

* Environment variables per run
* Tag-based execution
* Artifact uploads
* Retry failed runs

Phase 3 – Infrastructure

* Kubernetes job execution
* Helm deployment
* Prometheus metrics
* GitHub Actions CI

Phase 4 – Advanced features

* flaky test detection
* historical analytics
* Slack notifications
* environment comparison

---

# Use Cases

SmokeStack can be used as:

Internal QA platform
Self-service test execution portal
Environment verification tool
Release validation system
Test evidence repository

---

# License

MIT License

---

# Motivation

Modern teams rely heavily on automated testing but often lack a simple, centralized platform to trigger, observe, and manage those tests.

SmokeStack demonstrates how containerized infrastructure and Kubernetes can be used to create a scalable, reproducible QA execution platform with minimal complexity.
