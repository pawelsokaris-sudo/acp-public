import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { HandoffMessage } from '../types.js';

export class HandoffStore {
  private filePath: string;

  constructor(acpDir: string) {
    this.filePath = path.join(acpDir, 'handoffs.jsonl');
  }

  private generateId(): string {
    return `hoff_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
  }

  async create(params: {
    from_agent: string;
    from_session: string;
    to_agent: string;
    message: string;
    priority?: 'high' | 'medium' | 'low';
    expects_response?: boolean;
    context?: { related_threads?: string[]; files?: string[] };
  }): Promise<HandoffMessage> {
    const handoff: HandoffMessage = {
      handoff_id: this.generateId(),
      from_agent: params.from_agent,
      from_session: params.from_session,
      to_agent: params.to_agent,
      message: params.message,
      priority: params.priority,
      expects_response: params.expects_response,
      context: params.context,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    await this.appendLine(handoff);
    return handoff;
  }

  async getInbox(agentId: string): Promise<HandoffMessage[]> {
    const all = await this.readAll();
    return all.filter(h => h.to_agent === agentId && h.status === 'pending');
  }

  async acknowledge(handoffId: string, sessionId: string, status: 'accepted' | 'rejected', note?: string): Promise<boolean> {
    const all = await this.readAll();
    const idx = all.findIndex(h => h.handoff_id === handoffId && h.status === 'pending');
    if (idx === -1) return false;
    all[idx].status = status;
    all[idx].acknowledged_at = new Date().toISOString();
    all[idx].acknowledged_by_session = sessionId;
    if (note) all[idx].note = note;
    await this.writeAll(all);
    return true;
  }

  private async readAll(): Promise<HandoffMessage[]> {
    if (!fs.existsSync(this.filePath)) return [];
    const content = await fs.promises.readFile(this.filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);
    const entries: HandoffMessage[] = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }
    return entries;
  }

  private async appendLine(entry: HandoffMessage): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    await fs.promises.appendFile(this.filePath, line, 'utf-8');
  }

  private async writeAll(entries: HandoffMessage[]): Promise<void> {
    const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    await fs.promises.writeFile(this.filePath, content, 'utf-8');
  }
}
