/* SmokeStack Dashboard — vanilla JS SPA */

const API = '/api';
let suites = [];
let pollTimer = null;
let currentView = null; // 'list' | 'detail'
let currentRunId = null;
let detailPollTimer = null;

// ---- Router ---- //
function route() {
  const hash = window.location.hash;
  const runMatch = hash.match(/^#\/runs\/([^/]+)$/);
  if (runMatch) {
    setActiveNav(null);
    showDetail(runMatch[1]);
  } else if (hash === '#/architecture') {
    setActiveNav('architecture');
    showArchitecture();
  } else {
    setActiveNav('runs');
    showList();
  }
}

function setActiveNav(route) {
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });
}

window.addEventListener('hashchange', route);

// ---- Init ---- //
async function init() {
  await loadSuites();
  setupModal();
  route();
}

async function loadSuites() {
  try {
    const res = await fetch(`${API}/suites`);
    suites = await res.json();
    const sel = document.getElementById('suite-select');
    sel.innerHTML = suites.map(s =>
      `<option value="${s.id}">${s.name}</option>`
    ).join('');
    updateSuiteDesc();
  } catch (e) {
    console.error('Could not load suites', e);
  }
}

// ---- Modal ---- //
function setupModal() {
  const overlay = document.getElementById('modal-overlay');
  const btnNew  = document.getElementById('btn-new-run');
  const btnCancel = document.getElementById('btn-cancel');
  const btnTrigger = document.getElementById('btn-trigger');
  const suiteSelect = document.getElementById('suite-select');

  btnNew.addEventListener('click', () => overlay.classList.add('open'));
  btnCancel.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
  suiteSelect.addEventListener('change', updateSuiteDesc);

  btnTrigger.addEventListener('click', async () => {
    const suite = suiteSelect.value;
    const environment = document.getElementById('env-input').value.trim() || 'default';
    if (!suite) return;

    btnTrigger.disabled = true;
    btnTrigger.textContent = 'Starting…';

    try {
      const res = await fetch(`${API}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suite, environment }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Request failed');
      }
      const run = await res.json();
      overlay.classList.remove('open');
      toast('Run queued successfully!', 'success');
      // Navigate to detail view
      window.location.hash = `#/runs/${run.id}`;
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnTrigger.disabled = false;
      btnTrigger.textContent = '▶ Run Suite';
    }
  });
}

function updateSuiteDesc() {
  const sel = document.getElementById('suite-select');
  const desc = document.getElementById('suite-desc');
  const s = suites.find(x => x.id === sel.value);
  desc.textContent = s ? s.description : '';
}

// ---- List View ---- //
async function showList() {
  currentView = 'list';
  currentRunId = null;
  clearDetailPoll();

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="stats-row" id="stats-row">
      <div class="stat-card"><div class="label">Total Runs</div><div class="value" id="stat-total">—</div></div>
      <div class="stat-card green"><div class="label">Passed</div><div class="value" id="stat-passed">—</div></div>
      <div class="stat-card red"><div class="label">Failed</div><div class="value" id="stat-failed">—</div></div>
      <div class="stat-card blue"><div class="label">Queued / Running</div><div class="value" id="stat-active">—</div></div>
    </div>
    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">Recent Runs</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span id="refresh-indicator" style="font-size:12px;color:var(--muted)"></span>
          <button class="btn btn-ghost" id="btn-refresh" style="padding:5px 12px;font-size:12px;">↺ Refresh</button>
        </div>
      </div>
      <div id="runs-container">
        <div class="loading-state"><div class="spinner"></div> Loading runs…</div>
      </div>
    </div>
  `;

  document.getElementById('btn-refresh').addEventListener('click', () => fetchRuns());

  await fetchRuns();

  // Auto-refresh every 5s
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (currentView === 'list') fetchRuns(true);
  }, 5000);
}

async function fetchRuns(silent = false) {
  try {
    const res = await fetch(`${API}/runs?limit=50`);
    const data = await res.json();
    renderRunsTable(data.runs);
    renderStats(data.runs);

    if (!silent) {
      const ind = document.getElementById('refresh-indicator');
      if (ind) ind.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    }
  } catch (e) {
    if (!silent) {
      document.getElementById('runs-container').innerHTML =
        `<div class="empty"><div class="icon">⚠</div><h3>Could not load runs</h3><p>${e.message}</p></div>`;
    }
  }
}

function renderStats(runs) {
  const total  = runs.length;
  const passed = runs.filter(r => r.status === 'passed').length;
  const failed = runs.filter(r => r.status === 'failed' || r.status === 'error').length;
  const active = runs.filter(r => r.status === 'queued' || r.status === 'running').length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-total', total);
  set('stat-passed', passed);
  set('stat-failed', failed);
  set('stat-active', active);
}

function renderRunsTable(runs) {
  const container = document.getElementById('runs-container');
  if (!container) return;

  if (!runs.length) {
    container.innerHTML = `
      <div class="empty">
        <div class="icon">🚀</div>
        <h3>No runs yet</h3>
        <p>Trigger your first test run using the <strong>New Run</strong> button.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Suite</th>
          <th>Environment</th>
          <th>Results</th>
          <th>Duration</th>
          <th>Started</th>
        </tr>
      </thead>
      <tbody>
        ${runs.map(r => `
          <tr onclick="window.location.hash='#/runs/${r.id}'">
            <td>${badgeHtml(r.status)}</td>
            <td class="suite-name">${escHtml(r.suite)}</td>
            <td><span class="env-tag">${escHtml(r.environment)}</span></td>
            <td>${testCountsHtml(r)}</td>
            <td>${durationHtml(r)}</td>
            <td style="color:var(--muted);font-size:12px;">${timeAgo(r.created_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

// ---- Detail View ---- //
async function showDetail(runId) {
  currentView = 'detail';
  currentRunId = runId;
  clearInterval(pollTimer);

  const app = document.getElementById('app');
  app.innerHTML = `
    <a href="#/" class="back-link">← Back to runs</a>
    <div id="detail-content">
      <div class="loading-state"><div class="spinner"></div> Loading run…</div>
    </div>`;

  await fetchDetail(runId);

  // Poll while run is active
  clearDetailPoll();
  detailPollTimer = setInterval(async () => {
    if (currentView !== 'detail' || currentRunId !== runId) {
      clearDetailPoll();
      return;
    }
    const res = await fetch(`${API}/runs/${runId}`);
    if (!res.ok) return;
    const run = await res.json();
    if (run.status === 'queued' || run.status === 'running') {
      await fetchDetail(runId);
    } else {
      clearDetailPoll();
      await fetchDetail(runId);
    }
  }, 3000);
}

async function fetchDetail(runId) {
  const container = document.getElementById('detail-content');
  if (!container) return;

  try {
    const [runRes, logsRes] = await Promise.all([
      fetch(`${API}/runs/${runId}`),
      fetch(`${API}/runs/${runId}/logs`),
    ]);

    if (!runRes.ok) {
      container.innerHTML = `<div class="empty"><div class="icon">⚠</div><h3>Run not found</h3></div>`;
      return;
    }

    const run  = await runRes.json();
    const logs = logsRes.ok ? await logsRes.json() : { log_output: '' };

    const isActive = run.status === 'queued' || run.status === 'running';

    container.innerHTML = `
      <div class="detail-header">
        <div>
          <h1 style="font-size:20px;font-weight:700;">${escHtml(run.suite)}</h1>
          <div class="detail-meta">
            <span>ID: <span style="font-family:monospace">${run.id.slice(0, 8)}</span></span>
            <span>Env: ${escHtml(run.environment)}</span>
            <span>${new Date(run.created_at).toLocaleString()}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          ${badgeHtml(run.status)}
          ${isActive ? '<div class="spinner" style="width:16px;height:16px;"></div>' : ''}
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-stat">
          <div class="lbl">Total Tests</div>
          <div class="val">${run.total_tests ?? '—'}</div>
        </div>
        <div class="detail-stat" style="${run.passed_tests > 0 ? 'color:var(--green)' : ''}">
          <div class="lbl">Passed</div>
          <div class="val" style="color:${run.passed_tests > 0 ? 'var(--green)' : 'inherit'}">${run.passed_tests ?? '—'}</div>
        </div>
        <div class="detail-stat">
          <div class="lbl">Failed</div>
          <div class="val" style="color:${run.failed_tests > 0 ? 'var(--red)' : 'inherit'}">${run.failed_tests ?? '—'}</div>
        </div>
        <div class="detail-stat">
          <div class="lbl">Duration</div>
          <div class="val">${run.duration_ms ? (run.duration_ms / 1000).toFixed(1) + 's' : '—'}</div>
        </div>
      </div>

      ${run.error_message ? `
        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;font-size:13px;color:var(--red);">
          <strong>Error:</strong> ${escHtml(run.error_message)}
        </div>` : ''}

      ${artifactLinksHtml(run)}

      <div class="section-heading" style="margin-top:24px;">Output Log</div>
      <div class="log-box" id="log-box">
        ${isActive && !logs.log_output ? 'Waiting for output…' : escHtml(logs.log_output || '(no output captured)')}
      </div>`;

    // Auto-scroll log to bottom if active
    if (isActive) {
      const lb = document.getElementById('log-box');
      if (lb) lb.scrollTop = lb.scrollHeight;
    }
  } catch (e) {
    if (container) {
      container.innerHTML = `<div class="empty"><div class="icon">⚠</div><h3>Error loading run</h3><p>${escHtml(e.message)}</p></div>`;
    }
  }
}

function artifactLinksHtml(run) {
  if (!run.artifact_path) return '';
  const base = `/artifacts/${run.artifact_path}`;

  const links = [];

  if (run.suite.startsWith('playwright')) {
    links.push({ href: `${base}/html-report/index.html`, label: '📊 HTML Report' });
    links.push({ href: `${base}/results.json`, label: '📄 JSON Results' });
  } else if (run.suite.startsWith('newman')) {
    links.push({ href: `${base}/report.html`, label: '📊 HTML Report' });
    links.push({ href: `${base}/results.json`, label: '📄 JSON Results' });
  }

  links.push({ href: `${base}/run.log`, label: '📋 Run Log' });

  return `
    <div class="section-heading">Artifacts</div>
    <div class="artifact-links">
      ${links.map(l => `<a href="${l.href}" class="artifact-btn" target="_blank">${l.label}</a>`).join('')}
    </div>`;
}

function clearDetailPoll() {
  if (detailPollTimer) { clearInterval(detailPollTimer); detailPollTimer = null; }
}

// ---- Helpers ---- //
function badgeHtml(status) {
  const icons = { queued: '◷', running: '', passed: '✓', failed: '✗', error: '!' };
  const dot = status === 'running' ? '<span class="dot"></span>' : (icons[status] || '?');
  return `<span class="badge badge-${status}">${dot} ${status}</span>`;
}

function testCountsHtml(run) {
  if (run.total_tests == null) return '<span style="color:var(--muted)">—</span>';
  return `<span class="test-counts">
    <span class="pass">${run.passed_tests ?? 0}</span>
    <span class="sep">/</span>
    <span>${run.total_tests}</span>
    ${run.failed_tests > 0 ? `<span class="sep">·</span><span class="fail">${run.failed_tests} failed</span>` : ''}
  </span>`;
}

function durationHtml(run) {
  if (!run.duration_ms) return '<span style="color:var(--muted)">—</span>';
  return (run.duration_ms / 1000).toFixed(1) + 's';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Architecture View ---- //
function showArchitecture() {
  currentView = 'architecture';
  currentRunId = null;
  clearInterval(pollTimer);
  clearDetailPoll();

  document.getElementById('app').innerHTML = `
    <div class="arch-page">
      <h1>How SmokeStack Works</h1>
      <p class="subtitle">A queue-driven execution pipeline that separates control logic from test execution.</p>

      <div class="flow">

        <div class="flow-node">
          <div class="node-icon">👤</div>
          <div class="node-body">
            <div class="node-tech">Trigger</div>
            <div class="node-title">User / CI Pipeline</div>
            <div class="node-desc">A developer clicks "New Run" in the dashboard, or a CI pipeline calls the REST API to trigger a test suite.</div>
            <div class="node-pills">
              <span class="pill">Dashboard UI</span>
              <span class="pill">POST /api/runs</span>
              <span class="pill">GitHub Actions</span>
            </div>
          </div>
        </div>

        <div class="flow-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
          <span class="arrow-label">HTTP request</span>
        </div>

        <div class="flow-node">
          <div class="node-icon">⚡</div>
          <div class="node-body">
            <div class="node-tech">Node.js · Express</div>
            <div class="node-title">API Service</div>
            <div class="node-desc">Validates the request, creates a <code>queued</code> run record in PostgreSQL, then enqueues a job. Returns the run ID immediately — never blocks on test execution.</div>
            <div class="node-pills">
              <span class="pill">REST API</span>
              <span class="pill">BullMQ producer</span>
              <span class="pill">Serves dashboard</span>
            </div>
          </div>
        </div>

        <div class="flow-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
          <span class="arrow-label">enqueue job</span>
        </div>

        <div class="flow-node">
          <div class="node-icon">📬</div>
          <div class="node-body">
            <div class="node-tech">Redis · BullMQ</div>
            <div class="node-title">Job Queue</div>
            <div class="node-desc">Holds pending execution jobs. Manages worker concurrency, retries failed jobs with backoff, and decouples the API from slow test execution.</div>
            <div class="node-pills">
              <span class="pill">Configurable concurrency</span>
              <span class="pill">Auto-retry</span>
              <span class="pill">Job history</span>
            </div>
          </div>
        </div>

        <div class="flow-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
          <span class="arrow-label">dequeue &amp; process</span>
        </div>

        <div class="flow-node">
          <div class="node-icon">🏃</div>
          <div class="node-body">
            <div class="node-tech">Node.js · Playwright · Newman</div>
            <div class="node-title">Runner Worker</div>
            <div class="node-desc">Picks up a job, spawns the test framework as a child process, and streams stdout/stderr to a log file. Parses JSON result output after completion to extract pass/fail counts.</div>
            <div class="node-pills">
              <span class="pill">Playwright</span>
              <span class="pill">Newman</span>
              <span class="pill">Streaming logs</span>
              <span class="pill">Result parsing</span>
            </div>
          </div>
        </div>

        <div class="flow-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
          <span class="arrow-label">write results &amp; artifacts</span>
        </div>

        <div class="flow-split">
          <div class="flow-node">
            <div class="node-icon">🗄️</div>
            <div class="node-body">
              <div class="node-tech">PostgreSQL</div>
              <div class="node-title">Run Metadata</div>
              <div class="node-desc">Stores run records: status, pass/fail counts, duration, artifact path, and full log output.</div>
            </div>
          </div>
          <div class="flow-node">
            <div class="node-icon">📦</div>
            <div class="node-body">
              <div class="node-tech">Docker Volume</div>
              <div class="node-title">Artifact Storage</div>
              <div class="node-desc">Stores HTML reports, JSON results, screenshots, and raw run logs — served by the API.</div>
            </div>
          </div>
        </div>

        <div class="flow-arrow">
          <div class="arrow-line"></div>
          <div class="arrow-head"></div>
          <span class="arrow-label">read &amp; display</span>
        </div>

        <div class="flow-node">
          <div class="node-icon">📊</div>
          <div class="node-body">
            <div class="node-tech">Vanilla JS · Express static</div>
            <div class="node-title">Dashboard UI</div>
            <div class="node-desc">Polls the API every 5 seconds to show live run status. Click any run to see detailed logs, test counts, and artifact links including HTML reports.</div>
            <div class="node-pills">
              <span class="pill">Live status</span>
              <span class="pill">Artifact viewer</span>
              <span class="pill">Run history</span>
            </div>
          </div>
        </div>

      </div>

      <div class="section-heading">Technology Stack</div>
      <div class="tech-grid">
        <div class="tech-card">
          <div class="tc-layer">Backend</div>
          <div class="tc-name">Node.js + Express</div>
          <div class="tc-detail">REST API &amp; static file serving</div>
        </div>
        <div class="tech-card">
          <div class="tc-layer">Queue</div>
          <div class="tc-name">Redis + BullMQ</div>
          <div class="tc-detail">Job queue &amp; worker management</div>
        </div>
        <div class="tech-card">
          <div class="tc-layer">Database</div>
          <div class="tc-name">PostgreSQL 16</div>
          <div class="tc-detail">Run records &amp; metadata</div>
        </div>
        <div class="tech-card">
          <div class="tc-layer">Browser testing</div>
          <div class="tc-name">Playwright</div>
          <div class="tc-detail">UI &amp; API test framework</div>
        </div>
        <div class="tech-card">
          <div class="tc-layer">API testing</div>
          <div class="tc-name">Newman</div>
          <div class="tc-detail">Postman collection runner</div>
        </div>
        <div class="tech-card">
          <div class="tc-layer">Infrastructure</div>
          <div class="tc-name">Docker + Compose</div>
          <div class="tc-detail">Local containerised stack</div>
        </div>
        <div class="tech-card">
          <div class="tc-layer">Orchestration</div>
          <div class="tc-name">Kubernetes</div>
          <div class="tc-detail">Production deployment target</div>
        </div>
        <div class="tech-card">
          <div class="tc-layer">Frontend</div>
          <div class="tc-name">Vanilla JS</div>
          <div class="tc-detail">Zero-build SPA dashboard</div>
        </div>
      </div>

    </div>`;
}

let toastTimer;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// Start
init();
