const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const runsRouter = require('./routes/runs');
const SUITES = require('./suites');

const app = express();
const PORT = process.env.PORT || 3000;
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/artifacts';

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Available suites
app.get('/api/suites', (req, res) => {
  res.json(Object.values(SUITES));
});

// Runs API
app.use('/api/runs', runsRouter);

// Serve artifact files (HTML reports, logs, etc.)
// IMPORTANT: must be before the SPA catch-all
app.use('/artifacts', (req, res, next) => {
  const safePath = path.normalize(req.path).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(ARTIFACT_DIR, safePath);

  if (!filePath.startsWith(ARTIFACT_DIR)) {
    return res.status(403).send('Forbidden');
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Artifact not found');
  }

  res.sendFile(filePath);
});

// Serve dashboard static files
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// SPA catch-all — must be last
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SmokeStack API listening on http://localhost:${PORT}`);
});
