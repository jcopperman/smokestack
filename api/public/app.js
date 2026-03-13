/* SmokeStack Dashboard — vanilla JS SPA */

const API = '/api';
let suites = [];
let pollTimer = null;
let currentView = null; // 'list' | 'detail' | 'suites' | 'architecture' | 'use-cases'
let currentRunId = null;
let detailPollTimer = null;
let currentRuns = [];   // cached last fetch for tag filtering
let activeTag = null;   // currently selected tag filter

// ---- Router ---- //
function route() {
  const hash = window.location.hash;
  const runMatch = hash.match(/^#\/runs\/([^/]+)$/);
  if (runMatch) {
    setActiveNav(null);
    showDetail(runMatch[1]);
  } else if (hash === '#/suites') {
    setActiveNav('suites');
    showSuites();
  } else if (hash === '#/architecture') {
    setActiveNav('architecture');
    showArchitecture();
  } else if (hash === '#/use-cases') {
    setActiveNav('use-cases');
    showUseCases();
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
  const btnAddEnv = document.getElementById('btn-add-env-var');

  btnNew.addEventListener('click', () => overlay.classList.add('open'));
  btnCancel.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
  suiteSelect.addEventListener('change', updateSuiteDesc);
  btnAddEnv.addEventListener('click', () => addEnvVarRow());

  btnTrigger.addEventListener('click', async () => {
    const suite = suiteSelect.value;
    const environment = document.getElementById('env-input').value.trim() || 'default';
    if (!suite) return;

    // Collect env vars
    const env = {};
    document.querySelectorAll('.env-var-row').forEach(row => {
      const k = row.querySelector('.env-key').value.trim();
      const v = row.querySelector('.env-val').value;
      if (k) env[k] = v;
    });

    btnTrigger.disabled = true;
    btnTrigger.textContent = 'Starting…';

    try {
      const body = { suite, environment };
      if (Object.keys(env).length > 0) body.env = env;

      const res = await fetch(`${API}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Request failed');
      }
      const run = await res.json();
      overlay.classList.remove('open');
      // Clear env vars list for next open
      document.getElementById('env-vars-list').innerHTML = '';
      toast('Run queued successfully!', 'success');
      window.location.hash = `#/runs/${run.id}`;
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnTrigger.disabled = false;
      btnTrigger.textContent = '▶ Run Suite';
    }
  });
}

function addEnvVarRow(key = '', val = '') {
  const list = document.getElementById('env-vars-list');
  const row = document.createElement('div');
  row.className = 'env-var-row';
  row.innerHTML = `
    <input class="env-key" type="text" placeholder="KEY" value="${escHtml(key)}" />
    <span class="env-var-eq">=</span>
    <input class="env-val" type="text" placeholder="value" value="${escHtml(val)}" />
    <button class="btn-remove-env" title="Remove" onclick="this.closest('.env-var-row').remove()">✕</button>
  `;
  list.appendChild(row);
  row.querySelector('.env-key').focus();
}

function updateSuiteDesc() {
  const sel = document.getElementById('suite-select');
  const desc = document.getElementById('suite-desc');
  const tagsEl = document.getElementById('suite-tags');
  const s = suites.find(x => x.id === sel.value);
  desc.textContent = s ? s.description : '';
  if (tagsEl) {
    tagsEl.innerHTML = s && s.tags
      ? s.tags.map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('')
      : '';
  }
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
      <div id="tag-filter-bar" class="tag-filter-bar" style="display:none;">
        <span class="tag-filter-label">Filter by tag:</span>
        <div id="tag-filter-chips"></div>
      </div>
      <div id="runs-container">
        <div class="loading-state"><div class="spinner"></div> Loading runs…</div>
      </div>
    </div>
  `;

  document.getElementById('btn-refresh').addEventListener('click', () => fetchRuns());

  await fetchRuns();

  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (currentView === 'list') fetchRuns(true);
  }, 5000);
}

async function fetchRuns(silent = false) {
  try {
    const res = await fetch(`${API}/runs?limit=50`);
    const data = await res.json();
    currentRuns = data.runs;
    renderTagFilterBar(currentRuns);
    renderRunsTable(currentRuns);
    renderStats(currentRuns);

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

function getAllTags(runs) {
  const tags = new Set();
  runs.forEach(r => {
    const suite = suites.find(s => s.id === r.suite);
    if (suite && suite.tags) suite.tags.forEach(t => tags.add(t));
  });
  return [...tags].sort();
}

function renderTagFilterBar(runs) {
  const bar = document.getElementById('tag-filter-bar');
  const chips = document.getElementById('tag-filter-chips');
  if (!bar || !chips) return;

  const tags = getAllTags(runs);
  if (tags.length === 0) { bar.style.display = 'none'; return; }

  bar.style.display = 'flex';
  chips.innerHTML = `
    <button class="tag-btn${activeTag === null ? ' active' : ''}" data-tag="">All</button>
    ${tags.map(t => `<button class="tag-btn${activeTag === t ? ' active' : ''}" data-tag="${escHtml(t)}">${escHtml(t)}</button>`).join('')}
  `;
  chips.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTag = btn.dataset.tag || null;
      renderTagFilterBar(currentRuns);
      renderRunsTable(currentRuns);
    });
  });
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

  // Apply tag filter
  let filtered = runs;
  if (activeTag) {
    filtered = runs.filter(r => {
      const suite = suites.find(s => s.id === r.suite);
      return suite && suite.tags && suite.tags.includes(activeTag);
    });
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty">
        <div class="icon">🚀</div>
        <h3>${runs.length ? 'No runs match this tag' : 'No runs yet'}</h3>
        <p>${runs.length ? 'Try a different tag filter or clear it.' : 'Trigger your first test run using the <strong>New Run</strong> button.'}</p>
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
        ${filtered.map(r => {
          const suite = suites.find(s => s.id === r.suite);
          const tagChips = suite && suite.tags
            ? `<div class="row-tags">${suite.tags.map(t => `<span class="tag-chip tag-chip-sm">${escHtml(t)}</span>`).join('')}</div>`
            : '';
          return `
          <tr onclick="window.location.hash='#/runs/${r.id}'">
            <td>${badgeHtml(r.status)}</td>
            <td class="suite-name">${escHtml(r.suite)}${tagChips}</td>
            <td><span class="env-tag">${escHtml(r.environment)}</span></td>
            <td>${testCountsHtml(r)}</td>
            <td>${durationHtml(r)}</td>
            <td style="color:var(--muted);font-size:12px;">${timeAgo(r.created_at)}</td>
          </tr>`;
        }).join('')}
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

    // Show env vars if any were set
    const envVars = run.env_vars && Object.keys(run.env_vars).length > 0
      ? Object.entries(run.env_vars).map(([k, v]) =>
          `<div class="env-var-display-row"><span class="env-var-key">${escHtml(k)}</span><span class="env-var-sep">=</span><span class="env-var-value">${escHtml(v)}</span></div>`
        ).join('')
      : null;

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

      ${envVars ? `
        <div class="section-heading" style="margin-top:0;margin-bottom:10px;">Environment Variables</div>
        <div class="env-vars-display">${envVars}</div>
      ` : ''}

      ${run.error_message ? `
        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;font-size:13px;color:var(--red);">
          <strong>Error:</strong> ${escHtml(run.error_message)}
        </div>` : ''}

      ${artifactLinksHtml(run)}

      <div class="section-heading" style="margin-top:24px;">Output Log</div>
      <div class="log-box" id="log-box">
        ${isActive && !logs.log_output ? 'Waiting for output…' : escHtml(logs.log_output || '(no output captured)')}
      </div>`;

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

// ---- Suites View ---- //
async function showSuites() {
  currentView = 'suites';
  currentRunId = null;
  clearInterval(pollTimer);
  clearDetailPoll();

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="suites-page">
      <div class="suites-page-header">
        <h1 style="font-size:22px;font-weight:700;margin-bottom:4px;">Test Suites</h1>
        <p style="color:var(--muted);font-size:14px;">Pass rate history for each registered suite.</p>
      </div>
      <div class="suites-grid" id="suites-grid">
        <div class="loading-state"><div class="spinner"></div> Loading…</div>
      </div>
    </div>`;

  const grid = document.getElementById('suites-grid');
  if (!suites.length) {
    grid.innerHTML = `<div class="empty"><div class="icon">📭</div><h3>No suites registered</h3></div>`;
    return;
  }

  // Render suite cards
  grid.innerHTML = suites.map(s => `
    <div class="suite-card">
      <div class="suite-card-header">
        <div>
          <div class="suite-card-title">${escHtml(s.name)}</div>
          <div class="suite-card-tags">${(s.tags || []).map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('')}</div>
        </div>
        <span class="suite-type-badge suite-type-${s.type}">${s.type}</span>
      </div>
      <div class="suite-card-desc">${escHtml(s.description)}</div>
      <div class="chart-wrap">
        <canvas id="chart-${s.id}" height="100"></canvas>
      </div>
      <div class="suite-card-stats" id="stats-${s.id}" style="color:var(--muted);font-size:12px;">Loading history…</div>
    </div>
  `).join('');

  // Load history for all suites in parallel
  await Promise.all(suites.map(s => loadSuiteHistory(s)));
}

async function loadSuiteHistory(suite) {
  try {
    const res = await fetch(`${API}/suites/${suite.id}/history?limit=20`);
    if (!res.ok) throw new Error('Failed to load history');
    const data = await res.json();
    const history = data.history || [];

    const statsEl = document.getElementById(`stats-${suite.id}`);
    if (statsEl) {
      if (!history.length) {
        statsEl.textContent = 'No runs yet.';
      } else {
        const last = history[history.length - 1];
        const passRate = last.pass_rate != null ? Math.round(last.pass_rate * 100) : null;
        const totalRuns = history.length;
        statsEl.innerHTML = `
          <span>${totalRuns} run${totalRuns !== 1 ? 's' : ''}</span>
          ${passRate != null ? `<span style="margin-left:12px;color:${passRate >= 80 ? 'var(--green)' : passRate >= 50 ? 'var(--yellow)' : 'var(--red)'}">Latest pass rate: ${passRate}%</span>` : ''}
        `;
      }
    }

    const canvas = document.getElementById(`chart-${suite.id}`);
    if (!canvas || !history.length) return;

    // Destroy existing chart if any
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    const labels = history.map((_, i) => `#${i + 1}`);
    const passRates = history.map(r => r.pass_rate != null ? Math.round(r.pass_rate * 100) : null);
    const colors = passRates.map(p =>
      p == null ? 'rgba(136,146,164,0.4)' :
      p >= 80   ? 'rgba(34,197,94,0.7)' :
      p >= 50   ? 'rgba(245,158,11,0.7)' :
                  'rgba(239,68,68,0.7)'
    );

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Pass rate %',
          data: passRates,
          backgroundColor: colors,
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ctx.raw != null ? `${ctx.raw}% passed` : 'No data',
            },
          },
        },
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { color: '#8892a4', font: { size: 11 }, callback: v => `${v}%` },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          x: {
            ticks: { color: '#8892a4', font: { size: 11 } },
            grid: { display: false },
          },
        },
      },
    });
  } catch (e) {
    const statsEl = document.getElementById(`stats-${suite.id}`);
    if (statsEl) statsEl.textContent = 'Could not load history.';
  }
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

// ---- Use Cases View ---- //
function showUseCases() {
  currentView = 'use-cases';
  currentRunId = null;
  clearInterval(pollTimer);
  clearDetailPoll();

  document.getElementById('app').innerHTML = `
    <div class="uc-page">
      <h1>Use Cases</h1>
      <p class="subtitle">How teams use SmokeStack to verify, validate, and evidence their software quality.</p>

      <!-- Core workflow -->
      <div class="workflow-strip">
        <div class="wf-step">
          <div class="wf-icon">🖥️</div>
          <div class="wf-label">Trigger</div>
          <div class="wf-sublabel">Dashboard or API</div>
        </div>
        <div class="wf-arrow">›</div>
        <div class="wf-step">
          <div class="wf-icon">📬</div>
          <div class="wf-label">Queue</div>
          <div class="wf-sublabel">Redis / BullMQ</div>
        </div>
        <div class="wf-arrow">›</div>
        <div class="wf-step">
          <div class="wf-icon">🏃</div>
          <div class="wf-label">Execute</div>
          <div class="wf-sublabel">Isolated container</div>
        </div>
        <div class="wf-arrow">›</div>
        <div class="wf-step">
          <div class="wf-icon">📊</div>
          <div class="wf-label">Results</div>
          <div class="wf-sublabel">Pass / fail counts</div>
        </div>
        <div class="wf-arrow">›</div>
        <div class="wf-step">
          <div class="wf-icon">📦</div>
          <div class="wf-label">Artifacts</div>
          <div class="wf-sublabel">Reports &amp; logs</div>
        </div>
      </div>

      <div class="uc-grid">

        <!-- 1. Internal QA Platform -->
        <div class="uc-card">
          <div class="uc-card-header">
            <div class="uc-card-icon">🏢</div>
            <div>
              <h3>Internal QA Platform</h3>
              <span class="uc-tag uc-tag-team">Team tool</span>
            </div>
          </div>
          <p>Give your whole team a central place to trigger and observe test runs without needing to install anything locally. QA engineers, developers, and managers all see the same live dashboard.</p>
          <div class="uc-steps">
            <div class="uc-step"><span class="step-num">1</span><span class="step-text">Deploy SmokeStack on an internal server or shared cloud VM</span></div>
            <div class="uc-step"><span class="step-num">2</span><span class="step-text">Add your test suites to <em>examples/</em> and register them in <em>suites.js</em></span></div>
            <div class="uc-step"><span class="step-num">3</span><span class="step-text">Team members open the dashboard to trigger runs against any environment</span></div>
            <div class="uc-step"><span class="step-num">4</span><span class="step-text">Results, logs, and HTML reports are stored centrally for everyone to access</span></div>
          </div>
          <div class="uc-code"><span class="cm"># Trigger from the dashboard — no local tools needed</span>
POST /api/runs  { "suite": "regression", "environment": "staging" }</div>
        </div>

        <!-- 2. Release Gate / Pre-deploy Validation -->
        <div class="uc-card">
          <div class="uc-card-header">
            <div class="uc-card-icon">🚀</div>
            <div>
              <h3>Release Gate &amp; Pre-deploy Validation</h3>
              <span class="uc-tag uc-tag-release">Release</span>
            </div>
          </div>
          <p>Block a deployment from promoting to production until a smoke suite passes. Integrate SmokeStack into your CI/CD pipeline — trigger a run, poll for completion, and fail the pipeline if any tests fail.</p>
          <div class="uc-steps">
            <div class="uc-step"><span class="step-num">1</span><span class="step-text">CI pipeline deploys to staging</span></div>
            <div class="uc-step"><span class="step-num">2</span><span class="step-text">Pipeline calls <em>POST /api/runs</em> and captures the run ID</span></div>
            <div class="uc-step"><span class="step-num">3</span><span class="step-text">Pipeline polls <em>GET /api/runs/:id</em> until status is no longer <em>running</em></span></div>
            <div class="uc-step"><span class="step-num">4</span><span class="step-text">If <em>status === "failed"</em>, fail the pipeline — deployment is blocked</span></div>
          </div>
          <div class="uc-code"><span class="cm"># GitHub Actions step</span>
<span class="hl">- name:</span> Run smoke suite
  run: |
    ID=$(curl -s -X POST $SMOKESTACK/api/runs \\
      -H 'Content-Type: application/json' \\
      -d '{"suite":"smoke","environment":"staging"}' \\
      | jq -r .id)
    <span class="hl">while</span> true; do
      STATUS=$(curl -s $SMOKESTACK/api/runs/$ID | jq -r .status)
      [ "$STATUS" = "passed" ] && exit 0
      [ "$STATUS" = "failed" ] && exit 1
      sleep 5
    done</div>
        </div>

        <!-- 3. Environment Health Check -->
        <div class="uc-card">
          <div class="uc-card-header">
            <div class="uc-card-icon">🩺</div>
            <div>
              <h3>Environment Health Check</h3>
              <span class="uc-tag uc-tag-devops">DevOps</span>
            </div>
          </div>
          <p>Quickly verify a freshly provisioned or restored environment is healthy before handing it to a team. A focused smoke suite that hits critical endpoints confirms the environment is wired up correctly.</p>
          <div class="uc-steps">
            <div class="uc-step"><span class="step-num">1</span><span class="step-text">Create a lightweight suite that hits 5–10 critical API endpoints or pages</span></div>
            <div class="uc-step"><span class="step-num">2</span><span class="step-text">Trigger it against the new environment name — e.g. <em>"environment": "qa-env-14"</em></span></div>
            <div class="uc-step"><span class="step-num">3</span><span class="step-text">A green run in under 30 seconds confirms the environment is operational</span></div>
            <div class="uc-step"><span class="step-num">4</span><span class="step-text">The run log pinpoints exactly which check failed if something is broken</span></div>
          </div>
          <div class="uc-code"><span class="cm"># Check a specific named environment</span>
POST /api/runs
{
  <span class="hl">"suite"</span>: "health-check",
  <span class="hl">"environment"</span>: "qa-env-14"
}</div>
        </div>

        <!-- 4. Self-service Test Portal -->
        <div class="uc-card">
          <div class="uc-card-header">
            <div class="uc-card-icon">🧑‍💻</div>
            <div>
              <h3>Self-service Test Portal</h3>
              <span class="uc-tag uc-tag-qa">QA</span>
            </div>
          </div>
          <p>Developers can run the test suite for a feature branch themselves before raising a PR, without needing a QA engineer involved. Reduces feedback loop from hours to minutes.</p>
          <div class="uc-steps">
            <div class="uc-step"><span class="step-num">1</span><span class="step-text">Developer deploys their branch to a personal environment</span></div>
            <div class="uc-step"><span class="step-num">2</span><span class="step-text">Triggers a suite run from the dashboard, setting environment to their branch name</span></div>
            <div class="uc-step"><span class="step-num">3</span><span class="step-text">Views live logs as tests run — no waiting for a QA cycle</span></div>
            <div class="uc-step"><span class="step-num">4</span><span class="step-text">Shares the run URL with reviewers as evidence in the PR description</span></div>
          </div>
          <div class="uc-code"><span class="cm"># Developer triggers their own run</span>
POST /api/runs
{
  "suite": "api-integration",
  <span class="hl">"environment"</span>: "feat-payments-v2"
}</div>
        </div>

        <!-- 5. Test Evidence Repository -->
        <div class="uc-card">
          <div class="uc-card-header">
            <div class="uc-card-icon">📋</div>
            <div>
              <h3>Test Evidence Repository</h3>
              <span class="uc-tag uc-tag-compliance">Compliance</span>
            </div>
          </div>
          <p>Regulated industries (fintech, health, enterprise SaaS) often need to prove that testing occurred before a release. SmokeStack's artifact storage provides a permanent, timestamped record of every run.</p>
          <div class="uc-steps">
            <div class="uc-step"><span class="step-num">1</span><span class="step-text">Run a defined suite against the release candidate</span></div>
            <div class="uc-step"><span class="step-num">2</span><span class="step-text">HTML report, JSON results, and run log are stored with the run ID and timestamp</span></div>
            <div class="uc-step"><span class="step-num">3</span><span class="step-text">Reference the run ID in release notes, tickets, or change records</span></div>
            <div class="uc-step"><span class="step-num">4</span><span class="step-text">Artifacts are immutable and addressable via URL for audit review</span></div>
          </div>
          <div class="uc-code"><span class="cm"># Artifact URLs are permanent and shareable</span>
/artifacts/<span class="hl">{run-id}</span>/html-report/index.html
/artifacts/<span class="hl">{run-id}</span>/results.json
/artifacts/<span class="hl">{run-id}</span>/run.log</div>
        </div>

        <!-- 6. Scheduled Regression -->
        <div class="uc-card">
          <div class="uc-card-header">
            <div class="uc-card-icon">⏱️</div>
            <div>
              <h3>Scheduled Regression Testing</h3>
              <span class="uc-tag uc-tag-devops">DevOps</span>
            </div>
          </div>
          <p>Run a full regression suite on a schedule — nightly or after every deployment — to catch regressions in long-running environments that aren't covered by feature-level CI.</p>
          <div class="uc-steps">
            <div class="uc-step"><span class="step-num">1</span><span class="step-text">Set up a cron job or scheduled GitHub Actions workflow</span></div>
            <div class="uc-step"><span class="step-num">2</span><span class="step-text">It calls <em>POST /api/runs</em> for each suite you want to run overnight</span></div>
            <div class="uc-step"><span class="step-num">3</span><span class="step-text">Dashboard shows the history — spot when a test started failing between releases</span></div>
            <div class="uc-step"><span class="step-num">4</span><span class="step-text">Configure <em>WEBHOOK_URL</em> to get Slack alerts on failures</span></div>
          </div>
          <div class="uc-code"><span class="cm"># GitHub Actions scheduled trigger (nightly at 2am)</span>
<span class="hl">on:</span>
  schedule:
    - cron: <span class="hl">'0 2 * * *'</span>
<span class="hl">jobs:</span>
  nightly-regression:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST $SMOKESTACK/api/runs \\
            -d '{"suite":"regression","environment":"production"}'</div>
        </div>

      </div>

      <!-- Comparison table -->
      <div class="compare-table-wrap">
        <h2>SmokeStack vs. running tests locally</h2>
        <table class="compare-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Local (dev machine)</th>
              <th>SmokeStack</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Run tests against any environment</td>
              <td class="partial">⚠ Needs local config</td>
              <td class="check">✓ Any env via API param</td>
            </tr>
            <tr>
              <td>Non-engineers can trigger runs</td>
              <td class="cross">✗ Requires dev tools</td>
              <td class="check">✓ Browser dashboard</td>
            </tr>
            <tr>
              <td>Centralised run history</td>
              <td class="cross">✗ Lost after terminal closes</td>
              <td class="check">✓ PostgreSQL, permanent</td>
            </tr>
            <tr>
              <td>Shareable artifact links</td>
              <td class="cross">✗ Local files only</td>
              <td class="check">✓ URLs served by API</td>
            </tr>
            <tr>
              <td>CI/CD pipeline integration</td>
              <td class="partial">⚠ Custom scripting needed</td>
              <td class="check">✓ REST API + polling pattern</td>
            </tr>
            <tr>
              <td>Parallel test execution</td>
              <td class="partial">⚠ Blocks the machine</td>
              <td class="check">✓ Scale runner replicas</td>
            </tr>
            <tr>
              <td>Timestamped audit trail</td>
              <td class="cross">✗ No record</td>
              <td class="check">✓ Every run recorded with metadata</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>`;
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
            <div class="node-tech">Node.js · Playwright · Newman · k6</div>
            <div class="node-title">Runner Worker</div>
            <div class="node-desc">Picks up a job, spawns the test framework as a child process, and streams stdout/stderr to a log file. Parses JSON result output after completion to extract pass/fail counts. Sends webhook/Slack notification on completion.</div>
            <div class="node-pills">
              <span class="pill">Playwright</span>
              <span class="pill">Newman</span>
              <span class="pill">k6</span>
              <span class="pill">Streaming logs</span>
              <span class="pill">Webhook notify</span>
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
              <div class="node-desc">Stores run records: status, pass/fail counts, duration, artifact path, env vars, and full log output.</div>
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
            <div class="node-tech">Vanilla JS · Express static · Chart.js</div>
            <div class="node-title">Dashboard UI</div>
            <div class="node-desc">Polls the API every 5 seconds to show live run status. Click any run to see detailed logs, test counts, and artifact links. Suite view shows historical pass-rate bar charts.</div>
            <div class="node-pills">
              <span class="pill">Live status</span>
              <span class="pill">Tag filtering</span>
              <span class="pill">Pass rate charts</span>
              <span class="pill">Artifact viewer</span>
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
          <div class="tc-layer">Load testing</div>
          <div class="tc-name">k6</div>
          <div class="tc-detail">Performance &amp; load testing</div>
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
          <div class="tc-name">Vanilla JS + Chart.js</div>
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
