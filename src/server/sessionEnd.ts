import { Router } from 'express';
import crypto from 'crypto';
import { Journal } from '../core/journal.js';
import { loadRules } from '../core/rulesLoader.js';
import type { ActiveSession, SessionEndRequest } from '../types.js';

export function sessionEndRouter(acpDir: string, sessions: Map<string, ActiveSession>) {
  const router = Router();

  router.post('/session/end', async (req, res) => {
    const body = req.body as Partial<SessionEndRequest>;

    if (!body.session_id || !body.summary || !body.result) {
      res.status(400).json({ error: 'session_id, summary, and result are required' });
      return;
    }

    const session = sessions.get(body.session_id);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }

    const journal = new Journal(acpDir);

    // Compliance check
    const warnings: string[] = [];
    let riskyHandoff = false;

    if (!body.rules_checked) {
      riskyHandoff = true;
    } else {
      const rules = loadRules(acpDir);
      const frozenIds = rules.frozen.map(r => r.id);
      for (const fid of frozenIds) {
        if (!body.rules_checked.includes(fid)) {
          warnings.push(`frozen rule ${fid} not listed in rules_checked`);
        }
      }
    }

    // Log violations to journal
    if (body.rules_violated && body.rules_violated.length > 0) {
      const violationEvtId = `evt_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
      await journal.append({
        id: violationEvtId,
        ts: new Date().toISOString(),
        session: body.session_id,
        agent: session.agent,
        type: 'warning',
        text: `Rules violated: ${body.rules_violated.join(', ')}`,
        tags: ['violation', 'compliance'],
        persistence: 'project',
      });
    }

    const evtId = `evt_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    await journal.append({
      id: evtId,
      ts: new Date().toISOString(),
      session: body.session_id,
      agent: session.agent,
      type: 'session_end',
      summary: body.summary,
      result: body.result,
      files_changed: body.files_changed,
      decisions_made: body.decisions_made,
      open_threads: body.open_threads,
    });

    sessions.delete(body.session_id);

    res.json({
      closed: true,
      session_id: body.session_id,
      warnings,
      risky_handoff: riskyHandoff,
    });
  });

  return router;
}
