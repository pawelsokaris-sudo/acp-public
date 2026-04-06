import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('GET /health', () => {
  let tmpDir: string;
  let server: any;
  const PORT = 13083;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-health-'));
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), `
frozen:
  - id: arch-001
    text: "Test rule"
never:
  - id: sec-001
    text: "Never do this"
  - id: sec-002
    text: "Never do that"
always: []
`);
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');
    const app = createApp(tmpDir);
    server = app.listen(PORT);
  });

  afterAll(() => {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns status, version, and stats', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBe('0.2.0');
    expect(data.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(data.stats).toBeDefined();
    expect(data.stats.rules.frozen).toBe(1);
    expect(data.stats.rules.never).toBe(2);
    expect(data.stats.rules.always).toBe(0);
    expect(typeof data.stats.journal_entries).toBe('number');
  });

  it('health tracks active sessions', async () => {
    await fetch(`http://localhost:${PORT}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: { id: 'test' } }),
    });

    const res = await fetch(`http://localhost:${PORT}/health`);
    const data = await res.json();
    expect(data.stats.active_sessions).toBeGreaterThanOrEqual(1);
  });
});
