import https from 'https';
import http from 'http';
import { URL } from 'url';

export interface NotificationPayload {
  runId: string;
  suite: string;
  environment: string;
  status: string;
  passed_tests: number | null;
  failed_tests: number | null;
  total_tests: number | null;
  duration_ms: number | null;
}

function isSlackUrl(url: string): boolean {
  return url.includes('hooks.slack.com');
}

function buildSlackPayload(p: NotificationPayload): object {
  const emoji = p.status === 'passed' ? ':white_check_mark:' : p.status === 'failed' ? ':x:' : ':warning:';
  const results = p.total_tests != null ? `${p.passed_tests ?? 0} / ${p.total_tests}` : 'n/a';
  const duration = p.duration_ms != null ? `${(p.duration_ms / 1000).toFixed(1)}s` : 'n/a';

  return {
    text: `${emoji} SmokeStack run *${p.status.toUpperCase()}* — ${p.suite}`,
    blocks: [
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Suite:*\n${p.suite}` },
          { type: 'mrkdwn', text: `*Environment:*\n${p.environment}` },
          { type: 'mrkdwn', text: `*Status:*\n${emoji} ${p.status}` },
          { type: 'mrkdwn', text: `*Results:*\n${results} passed` },
          { type: 'mrkdwn', text: `*Duration:*\n${duration}` },
          { type: 'mrkdwn', text: `*Run ID:*\n\`${p.runId.slice(0, 8)}\`` },
        ],
      },
    ],
  };
}

function buildGenericPayload(p: NotificationPayload): object {
  return {
    runId: p.runId,
    suite: p.suite,
    environment: p.environment,
    status: p.status,
    passed_tests: p.passed_tests,
    failed_tests: p.failed_tests,
    total_tests: p.total_tests,
    duration_ms: p.duration_ms,
    timestamp: new Date().toISOString(),
  };
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) return;

  const body = isSlackUrl(webhookUrl)
    ? buildSlackPayload(payload)
    : buildGenericPayload(payload);

  const bodyStr = JSON.stringify(body);

  return new Promise((resolve) => {
    try {
      const parsed = new URL(webhookUrl);
      const lib = parsed.protocol === 'https:' ? https : http;

      const req = lib.request(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      }, (res) => {
        res.resume(); // drain response body
        resolve();
      });

      req.on('error', (err) => {
        console.error('[runner] Webhook notification failed:', err.message);
        resolve();
      });

      req.setTimeout(5000, () => {
        req.destroy();
        console.error('[runner] Webhook notification timed out');
        resolve();
      });

      req.write(bodyStr);
      req.end();
    } catch (err) {
      console.error('[runner] Webhook notification error:', (err as Error).message);
      resolve();
    }
  });
}
