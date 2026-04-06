# ACP -- Agent Context Protocol

MCP lets agents connect. ACP tells them how to enter a project safely.

## The problem

AI coding agents start every session with amnesia. They don't know what
was decided yesterday, what broke last week, or which files are off-limits.
The developer becomes a courier -- repeating rules, pasting context, explaining
history. ACP fixes this by giving every agent the same onboarding packet:
rules, recent memory, and environment -- automatically, on session start.

## Quick start

```bash
# 1. Install
npm install acp

# 2. Initialize in your project
npx acp init

# 3. Edit your rules
vi .acp/rules.yaml

# 4. Start the server
npx acp start

# 5. Agent connects and gets full context
curl -s http://localhost:3075/session/start \
  -H "Content-Type: application/json" \
  -d '{"agent":{"id":"claude"}}'
```

The response contains rules, recent journal entries, blockers, and
environment info. The agent is onboarded.

## How it works

```
.acp/
  rules.yaml          Developer-written project rules
  environment.yaml    Services, important files, do-not-touch list
  journal.jsonl       Append-only log of discoveries, decisions, blockers
  handoffs.jsonl      Async agent-to-agent messages
  config.yaml         Server port, version

         +------------------+
         |   ACP Server     |
         |   localhost:3075  |
         +--------+---------+
                  |
    +-------------+-------------+
    |             |             |
session/start   publish    session/end
    |             |             |
    v             v             v
 Returns       Appends      Closes
 full context  to journal   session
```

On `session/start`, ACP reads the three files, assembles context
(rules + recent memory + active blockers + last session summary),
and returns it as a single JSON payload. The agent works, publishes
discoveries and decisions to the journal, and ends the session with
a summary. The next agent picks up where the last one left off.

## Files

| File | Purpose | Git |
|------|---------|-----|
| `rules.yaml` | Project rules: frozen decisions, never/always constraints | Commit |
| `environment.yaml` | Services, important files, protected paths | Commit |
| `journal.jsonl` | Append-only event log (sessions, discoveries, decisions) | Gitignore |
| `handoffs.jsonl` | Async agent-to-agent messages | Gitignore |
| `config.yaml` | ACP server configuration | Commit |

### rules.yaml

Three tiers with strict priority: `frozen > never > always > memory > agent guess`.

```yaml
frozen:
  - id: arch-001
    text: "PostgreSQL 17, no ORM, Kysely only"
    source: ADR-001
    since: 2026-01-15
    rationale: "Kysely provides type-safe SQL without ORM overhead"
    owner: "tech-lead"
    status: active
    last_reviewed: 2026-04-01
    expires_at: null

never:
  - id: sec-001
    text: "Never commit .env or credentials"

always:
  - id: qa-001
    text: "Run tests before committing"
```

New optional rule fields (v0.2): `rationale` (why the rule exists),
`owner` (who owns it), `status` (active/draft/deprecated),
`last_reviewed`, `expires_at` (null = permanent).

### Journal entry types

`session_start`, `discovery`, `decision`, `blocker`, `warning`,
`result`, `handoff`, `session_end`

Each entry has confidence (`high/medium/low`) and persistence
(`ephemeral/session/project`).

## API

### GET /health

Returns server status, version, and stats.

```json
{
  "status": "ok",
  "version": "0.2.0",
  "uptime": 3600,
  "stats": {
    "rules_count": 12,
    "journal_entries": 48,
    "active_sessions": 2
  }
}
```

### POST /session/start

Agent announces itself, gets full context back. Now accepts an
`objective` field and returns `handoff_inbox` with pending handoffs.

```bash
curl http://localhost:3075/session/start \
  -H "Content-Type: application/json" \
  -d '{
    "agent": {"id": "claude", "kind": "coding"},
    "scope": {"task": "fix-auth-bug"},
    "intent": {"summary": "Debug the JWT expiry issue"},
    "objective": "Deploy KSeF Agent v2"
  }'
```

Response:

```json
{
  "session": {
    "session_id": "sess_20260405_a1b2",
    "started_at": "2026-04-05T10:00:00.000Z",
    "rules_hash": "abc123"
  },
  "rules": { "frozen": [...], "never": [...], "always": [...] },
  "memory": {
    "recent": [...],
    "blockers": [...],
    "last_session": {
      "agent": "copilot",
      "summary": "Refactored auth module, tests green",
      "ended_at": "2026-04-04T18:00:00.000Z",
      "result": "complete"
    }
  },
  "environment": {
    "services": [...],
    "important_files": [...],
    "do_not_touch": [...]
  },
  "handoff_inbox": [...]
}
```

### POST /publish

Agent records a discovery, decision, or blocker during work.
Now accepts `parent_id` (threading) and `agent_model` (provenance).

```bash
curl http://localhost:3075/publish \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_20260405_a1b2",
    "type": "decision",
    "text": "Switched from bcrypt to argon2 for password hashing",
    "confidence": "high",
    "persistence": "project",
    "tags": ["auth", "security"],
    "parent_id": "evt_20260405_x1y2",
    "agent_model": "claude-opus-4-20250514"
  }'
```

### POST /session/end

Agent closes session with a summary for the next agent. Now accepts
`rules_checked` and `rules_violated` for compliance reporting. Returns
warnings and risky handoff flags.

```bash
curl http://localhost:3075/session/end \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_20260405_a1b2",
    "summary": "Fixed JWT expiry, added refresh token rotation",
    "files_changed": ["src/auth/jwt.ts", "tests/auth.test.ts"],
    "decisions_made": ["Switch to argon2"],
    "open_threads": ["Rate limiting not yet implemented"],
    "result": "complete",
    "rules_checked": ["arch-001", "sec-001"],
    "rules_violated": []
  }'
```

Response: `{ "closed": true, "warnings": [...], "risky_handoff": false }`

### POST /handoff

Send an async message to another agent.

```bash
curl http://localhost:3075/handoff \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_20260405_a1b2",
    "to_agent": "gemini",
    "message": "Auth module refactored, please review tests"
  }'
```

### GET /handoff/inbox?agent=\<id\>

Get pending handoffs for an agent.

### POST /handoff/ack

Acknowledge a handoff.

```bash
curl http://localhost:3075/handoff/ack \
  -H "Content-Type: application/json" \
  -d '{
    "handoff_id": "ho_20260405_z9w8",
    "session_id": "sess_20260405_c3d4",
    "status": "accepted"
  }'
```

## CLI

```
acp init      Create .acp/ directory with template files
acp start     Start ACP server (default port 3075, -p to override)
acp export    Print current context to stdout (no server needed)
```

## Integration modes

**v0.1:** HTTP. Agent calls `curl` or any HTTP client.
Start the server, point the agent at `localhost:3075`.

**v0.2 (now):** Enhanced HTTP with rule governance, journal threading,
async handoffs, and compliance reporting. Same HTTP interface, richer protocol.

**v0.3 (planned):** MCP bridge, SDK clients, community rules packs.

## Positioning

ACP is not a memory service (Mem0), not a tool protocol (MCP), and not
a static file convention (CLAUDE.md / .cursorrules).

| | Static files | MCP | Memory services | ACP |
|---|---|---|---|---|
| Rules | Yes | No | No | Yes |
| Memory | No | No | Yes | Yes |
| Environment | No | No | No | Yes |
| Multi-agent handoff | No | No | Partial | Yes |
| Session lifecycle | No | No | No | Yes |
| Zero vendor lock-in | Yes | Partial | No | Yes |

ACP is the **onboarding layer** -- it sits between the project and
the agent, ensuring every session starts with the same ground truth
regardless of which agent connects.

## Roadmap

- **v0.1** -- HTTP server, YAML rules, JSONL journal, CLI (done)
- **v0.2** -- Rule governance, journal threading, async handoffs, compliance loop (done)
- **v0.3** -- MCP bridge, conflict detection, SDK clients, community rules packs

## License

MIT. See [LICENSE](LICENSE).
