import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ACP Server', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13075;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-'));
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), 'frozen: []\nnever: []\nalways: []\n');
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');
    const app = createApp(tmpDir);
    server = app.listen(PORT);
  });

  afterAll(() => {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /session/start returns context', async () => {
    const res = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'test-agent' }, scope: { task: 'test' } }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.session_id).toMatch(/^sess_/);
    expect(data.rules).toBeDefined();
    expect(data.memory).toBeDefined();
    expect(data.environment).toBeDefined();
  });

  it('POST /session/start without agent.id returns 400', async () => {
    const res = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('POST /publish appends entry', async () => {
    // Start session first
    const startRes = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'test-agent' } }),
    });
    const sessionId = (await startRes.json()).session.session_id;

    const pubRes = await fetch(`http://localhost:${PORT}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId, type: 'discovery',
        text: 'Found something', confidence: 'high', persistence: 'project',
      }),
    });
    expect(pubRes.status).toBe(200);
    const pubData = await pubRes.json();
    expect(pubData.ok).toBe(true);
    expect(pubData.id).toMatch(/^evt_/);
  });

  it('POST /publish with invalid session returns 404', async () => {
    const res = await fetch(`http://localhost:${PORT}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'sess_nonexistent', type: 'discovery', text: 'fail' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /publish accepts parent_id and agent_model', async () => {
    const startRes = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'test-agent' } }),
    });
    const sessionId = (await startRes.json()).session.session_id;

    const pubRes = await fetch(`http://localhost:${PORT}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        type: 'decision',
        text: 'Follow-up on previous',
        parent_id: 'evt_previous_123',
        agent_model: 'claude-3.5-sonnet',
        confidence: 'high',
        persistence: 'project',
      }),
    });
    expect(pubRes.status).toBe(200);
    const data = await pubRes.json();
    expect(data.ok).toBe(true);
    expect(data.id).toMatch(/^evt_/);
  });

  it('POST /session/start accepts objective and echoes it back', async () => {
    const res = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: { id: 'test-agent', model: 'claude-3.5-sonnet' },
        objective: {
          task: 'fix-auth-bug',
          description: 'JWT tokens expire after 5min instead of 1h',
          success_criteria: 'All auth tests pass, token TTL = 3600s',
          assigned_by: 'pawel',
        },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.objective).toBeDefined();
    expect(data.objective.task).toBe('fix-auth-bug');
    expect(data.objective.assigned_by).toBe('pawel');
  });

  it('POST /session/start without objective returns null objective', async () => {
    const res = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'test-agent' } }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.objective).toBeNull();
  });

  it('POST /session/end closes session', async () => {
    const startRes = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'test-agent' } }),
    });
    const sessionId = (await startRes.json()).session.session_id;

    const endRes = await fetch(`http://localhost:${PORT}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, summary: 'Done', result: 'complete' }),
    });
    expect(endRes.status).toBe(200);

    // Publishing to closed session should fail
    const pubRes = await fetch(`http://localhost:${PORT}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, type: 'discovery', text: 'fail' }),
    });
    expect(pubRes.status).toBe(404);
  });
});
