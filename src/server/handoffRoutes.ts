import { Router } from 'express';
import { HandoffStore } from '../core/handoffStore.js';
import type { ActiveSession } from '../types.js';

export function handoffRouter(acpDir: string, sessions: Map<string, ActiveSession>) {
  const router = Router();
  const store = new HandoffStore(acpDir);

  router.post('/handoff', async (req, res) => {
    const { session_id, to_agent, message, priority, expects_response, context } = req.body;
    if (!session_id || !to_agent || !message) {
      res.status(400).json({ error: 'session_id, to_agent, and message are required' });
      return;
    }
    const session = sessions.get(session_id);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }

    const handoff = await store.create({
      from_agent: session.agent,
      from_session: session_id,
      to_agent,
      message,
      priority,
      expects_response,
      context,
    });

    res.json({
      handoff_id: handoff.handoff_id,
      status: handoff.status,
      to_agent: handoff.to_agent,
      created_at: handoff.created_at,
    });
  });

  router.get('/handoff/inbox', async (req, res) => {
    const agent = req.query.agent as string;
    if (!agent) {
      res.status(400).json({ error: 'agent query parameter is required' });
      return;
    }

    const pending = await store.getInbox(agent);
    res.json({ agent, pending });
  });

  router.post('/handoff/ack', async (req, res) => {
    const { handoff_id, session_id, status, note } = req.body;
    if (!handoff_id || !session_id || !status) {
      res.status(400).json({ error: 'handoff_id, session_id, and status are required' });
      return;
    }

    const ok = await store.acknowledge(handoff_id, session_id, status, note);
    if (!ok) {
      res.status(404).json({ error: 'handoff not found or already acknowledged' });
      return;
    }

    res.json({ ok: true });
  });

  return router;
}
