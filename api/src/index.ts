import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import runsRouter from './routes/runs';
import suitesRouter from './routes/suites';
import runnerRouter from './routes/runner';

const app = express();
const PORT = process.env.PORT || 3000;
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/artifacts';

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Suites API (list + history)
app.use('/api/suites', suitesRouter);

// Runs API
app.use('/api/runs', runsRouter);

// Runner status (queue depth + k8s pod count)
app.use('/api/runner', runnerRouter);

// Serve artifact files — must be before the SPA catch-all
app.use('/artifacts', (req: Request, res: Response, _next: NextFunction) => {
  const safePath = path.normalize(req.path).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(ARTIFACT_DIR, safePath);

  if (!filePath.startsWith(ARTIFACT_DIR)) {
    res.status(403).send('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).send('Artifact not found');
    return;
  }

  res.sendFile(filePath);
});

// Serve dashboard static files
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// SPA catch-all — must be last
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SmokeStack API listening on http://localhost:${PORT}`);
});
