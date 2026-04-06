import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Compliance report (session/end)', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13081;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-compliance-'));
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), `
frozen:
  - id: arch-001
    text: "PostgreSQL only"
  - id: arch-002
    text: "No direct DB access from routes"
never:
  - id: sec-001
    text: "Never commit secrets"
always:
  - id: qa-001
    text: "Run tests before commit"
`);
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');
    const app = createApp(tmpDir);
    server = app.listen(PORT);
  });

  afterAll(() => {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function startSession(): Promise<string> {
    const res = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'test-agent' } }),
    });
    return (await res.json()).session.session_id;
  }

  it('session/end with all frozen rules checked returns no warnings', async () => {
    const sessionId = await startSession();
    const res = await fetch(`http://localhost:${PORT}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        summary: 'All good',
        result: 'complete',
        rules_checked: ['arch-001', 'arch-002', 'sec-001'],
        rules_violated: [],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.closed).toBe(true);
    expect(data.warnings).toEqual([]);
    expect(data.risky_handoff).toBe(false);
  });

  it('session/end with missing frozen rules returns warnings', async () => {
    const sessionId = await startSession();
    const res = await fetch(`http://localhost:${PORT}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        summary: 'Partial check',
        result: 'complete',
        rules_checked: ['arch-001'],
        rules_violated: [],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.closed).toBe(true);
    expect(data.warnings).toContain('frozen rule arch-002 not listed in rules_checked');
    expect(data.risky_handoff).toBe(false);
  });

  it('session/end without rules_checked marks risky_handoff', async () => {
    const sessionId = await startSession();
    const res = await fetch(`http://localhost:${PORT}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        summary: 'Quick exit',
        result: 'partial',
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.closed).toBe(true);
    expect(data.risky_handoff).toBe(true);
  });

  it('session/end with rules_violated logs violation to journal', async () => {
    const sessionId = await startSession();
    await fetch(`http://localhost:${PORT}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        summary: 'Had to violate a rule',
        result: 'complete',
        rules_checked: ['arch-001', 'arch-002'],
        rules_violated: ['arch-002'],
      }),
    });

    // Start new session to check journal
    const res2 = await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'checker' } }),
    });
    const ctx = await res2.json();
    const violations = ctx.memory.recent.filter((e: any) => e.type === 'warning' && e.tags?.includes('violation'));
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it('session/end still works with old format (backward-compatible)', async () => {
    const sessionId = await startSession();
    const res = await fetch(`http://localhost:${PORT}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        summary: 'Old format',
        files_changed: ['src/index.ts'],
        decisions_made: ['Used old API'],
        open_threads: ['Upgrade later'],
        result: 'complete',
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.closed).toBe(true);
    expect(data.risky_handoff).toBe(true);
  });
});
