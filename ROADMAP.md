# ACP Roadmap

> Based on cross-model consultation (Claude, GPT, Grok, Gemini) — April 2026.
> Each model answered from the perspective of an AI agent that would USE ACP.

---

## v0.1.0 — Current (Done)

- HTTP server (Express 5, TypeScript)
- 3-tier rule hierarchy (frozen > never > always)
- Session lifecycle (start → publish → end)
- Append-only journal (JSONL)
- Web panel with magic link auth
- Bearer token auth for agents
- CLI (init, start, export)
- 40 tests, zero databases, zero vendor lock-in

## v0.2.0 — Governance & Multi-Agent (Done)

### Rule Governance
- New optional rule fields: `rationale`, `owner`, `status` (active/draft/deprecated), `last_reviewed`, `expires_at`
- Expired rules auto-flagged on session start
- Rules loaded with governance metadata, validated on parse

**Why:** "Models follow rules better when they understand intent" (Gemini). `rationale` reduces Rule Drift.

### Journal Threading
- `parent_id` field on publish — links entries into conversation threads
- `agent_model` field — provenance tracking (which model wrote this)

**Why:** Without threading, journal is a flat stream. Threads let agents follow a line of reasoning.

### Async Handoffs
- `POST /handoff` — send message to another agent
- `GET /handoff/inbox?agent=<id>` — get pending handoffs
- `POST /handoff/ack` — acknowledge a handoff (accepted/rejected/deferred)
- Stored in `.acp/handoffs.jsonl`
- Pending handoffs delivered on `session/start` as `handoff_inbox`

**Why:** Agents need to leave notes for specific other agents, not just broadcast to journal.

### Compliance Reporting
- `session/end` now accepts `rules_checked` and `rules_violated`
- Server flags sessions with no rules checked as `risky_handoff`
- Response includes `{ closed, warnings, risky_handoff }`

**Why:** All 4 models said rules must be verified procedurally, not remembered. "Self-policing protocol" (Grok).

### Enhanced Health Endpoint
- `GET /health` returns version, uptime, stats (rules count, journal entries, active sessions)

### Objective Field
- `session/start` accepts `objective` — agent knows the goal, not just the world

## v0.3.0 — Ecosystem

### MCP Bridge
Expose ACP as MCP tool server. Agents that speak MCP get context automatically.

### Conflict Detection
When agent publishes a decision, server checks last N entries for contradictions.
Agent notified if decision contradicts a previous entry. Human resolves in panel.

### Context Compression
`POST /context/summarize` — condensed journal for onboarding, full journal for audit.

### Session Recovery
`POST /session/recover` — resume an interrupted session without losing context.

### SDK Clients
- TypeScript client (`@acp/client`)
- Python client (`acp-client`)

### Community Rules Packs
- Shareable rule sets (e.g., "security-baseline", "typescript-conventions")
- Import: `acp import security-baseline`

### Observability Dashboard
- Drift rate per agent/model
- Most violated rules
- Handoff chain visualization
- Recovery time metrics

## Open Questions (from consultation)

1. **Experimental/Draft rule tier** (Gemini): Should there be a 4th tier for "proposed" rules that agents can test but aren't enforced? Risk: complexity creep.

2. **Ghost channel** (Gemini): Separate space for subjective observations ("this module feels unstable") that aren't blockers. Risk: noise.

3. **Local files vs ACP** (Antek/Gemini): In practice, local knowledge files provide 90% of context recovery, ACP journal only 10%. Should ACP integrate with local file discovery? Risk: scope creep.

4. **Publish gaming** (GPT): Agent optimizes for "looking compliant" rather than actual compliance. How to detect? Risk: bureaucracy.

5. **Rule explosion at scale** (Grok): 1000 rules → agents spend more time navigating rules than working. Mitigation: scoping rules to tasks/modules, lazy loading.

---

## Consultation Credits

This roadmap was shaped by feedback from 4 AI models, each answering as a potential ACP user:

- **Claude (Anthropic)** — coding agent perspective
- **GPT (OpenAI)** — protocol design critique
- **Grok (xAI)** — operational/scale analysis
- **Gemini (Google)** — deploy agent perspective + production experience

The consultation prompt is available in `docs/CONSULTATION_PROMPT.md`.
