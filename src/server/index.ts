import express from 'express';
import { sessionStartRouter } from './sessionStart.js';
import { publishRouter } from './publish.js';
import { sessionEndRouter } from './sessionEnd.js';
import { handoffRouter } from './handoffRoutes.js';
import { loadTokens, authMiddleware } from './auth.js';
import { panelAuthRouter } from './panelAuth.js';
import { panelApiRouter } from './panelApi.js';
import { loadRules } from '../core/rulesLoader.js';
import { Journal } from '../core/journal.js';
import type { ActiveSession } from '../types.js';

export function createApp(acpDir: string) {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, ActiveSession>();
  const startTime = Date.now();

  // Health check — no auth
  app.get('/health', async (_req, res) => {
    const rules = loadRules(acpDir);
    const journal = new Journal(acpDir);
    const entries = await journal.readAll();

    res.json({
      status: 'ok',
      version: '0.2.0',
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      stats: {
        active_sessions: sessions.size,
        rules: {
          frozen: rules.frozen.length,
          never: rules.never.length,
          always: rules.always.length,
        },
        journal_entries: entries.length,
      },
    });
  });

  // Panel auth routes — public (before auth middleware)
  app.use(panelAuthRouter());

  // Auth middleware — skipped if no ACP_TOKEN_* env vars
  const tokenMap = loadTokens();
  app.use(authMiddleware(tokenMap));

  // Panel API routes — protected by auth middleware
  app.use(panelApiRouter(acpDir));

  app.use(sessionStartRouter(acpDir, sessions));
  app.use(publishRouter(acpDir, sessions));
  app.use(sessionEndRouter(acpDir, sessions));
  app.use(handoffRouter(acpDir, sessions));

  return app;
}
