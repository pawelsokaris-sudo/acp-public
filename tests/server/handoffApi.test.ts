import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Handoff endpoints', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13082;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-handoff-api-'));
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), 'frozen: []\nnever: []\nalways: []\n');
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');
    const app = createApp(tmpDir);
    server = app.listen(PORT);
  });

  afterAll(() => {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const base = `http://localhost:${PORT}`;
  const json = (body: any) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  async function startSession(agentId: string): Promise<string> {
    const res = await fetch(`${base}/session/start`, json({ agent: { id: agentId } }));
    return (await res.json()).session.session_id;
  }

  it('POST /handoff creates a handoff message', async () => {
    const sessionId = await startSession('claude');
    const res = await fetch(`${base}/handoff`, json({
      session_id: sessionId,
      to_agent: 'gemini',
      message: 'Deploy is ready, run smoke tests',
      priority: 'high',
      expects_response: true,
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.handoff_id).toMatch(/^hoff_/);
    expect(data.status).toBe('pending');
    expect(data.to_agent).toBe('gemini');
  });

  it('POST /handoff requires session_id, to_agent, message', async () => {
    const res = await fetch(`${base}/handoff`, json({
      to_agent: 'gemini',
      message: 'Missing session',
    }));
    expect(res.status).toBe(400);
  });

  it('GET /handoff/inbox returns pending handoffs for agent', async () => {
    const sessionId = await startSession('claude');
    await fetch(`${base}/handoff`, json({
      session_id: sessionId,
      to_agent: 'inbox-test-agent',
      message: 'First task',
      priority: 'high',
    }));
    await fetch(`${base}/handoff`, json({
      session_id: sessionId,
      to_agent: 'inbox-test-agent',
      message: 'Second task',
      priority: 'low',
    }));

    const res = await fetch(`${base}/handoff/inbox?agent=inbox-test-agent`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.agent).toBe('inbox-test-agent');
    expect(data.pending).toHaveLength(2);
    expect(data.pending.every((h: any) => h.to_agent === 'inbox-test-agent')).toBe(true);
  });

  it('GET /handoff/inbox requires agent query param', async () => {
    const res = await fetch(`${base}/handoff/inbox`);
    expect(res.status).toBe(400);
  });

  it('POST /handoff/ack acknowledges a handoff', async () => {
    const sessionId = await startSession('claude');
    const createRes = await fetch(`${base}/handoff`, json({
      session_id: sessionId,
      to_agent: 'ack-test-agent',
      message: 'To be acknowledged',
    }));
    const { handoff_id } = await createRes.json();

    const geminiSession = await startSession('ack-test-agent');
    const ackRes = await fetch(`${base}/handoff/ack`, json({
      handoff_id,
      session_id: geminiSession,
      status: 'accepted',
      note: 'On it',
    }));
    expect(ackRes.status).toBe(200);
    const ackData = await ackRes.json();
    expect(ackData.ok).toBe(true);

    // After ack, should not appear in inbox
    const inboxRes = await fetch(`${base}/handoff/inbox?agent=ack-test-agent`);
    const inbox = await inboxRes.json();
    const found = inbox.pending.find((h: any) => h.handoff_id === handoff_id);
    expect(found).toBeUndefined();
  });

  it('handoff_inbox appears in session/start response', async () => {
    const sessionId = await startSession('claude');
    await fetch(`${base}/handoff`, json({
      session_id: sessionId,
      to_agent: 'start-inbox-agent',
      message: 'Check this out',
      priority: 'medium',
    }));

    const res = await fetch(`${base}/session/start`, json({ agent: { id: 'start-inbox-agent' } }));
    const data = await res.json();
    expect(data.handoff_inbox).toBeDefined();
    expect(data.handoff_inbox.length).toBeGreaterThanOrEqual(1);
    expect(data.handoff_inbox[0].message).toBe('Check this out');
  });
});
