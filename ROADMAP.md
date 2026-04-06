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

## v0.1.1 — Quick Wins

Based on unanimous feedback from 4 AI models:

### Publish Schema (mandatory fields)
Currently `publish` accepts any text. Add required structure:
```json
{
  "type": "discovery|decision|blocker",
  "text": "...",
  "confidence": "high|medium|low",
  "persistence": "project|session|ephemeral",
  "rules_checked": ["arch-001", "sec-002"],
  "relates_to": "evt_previous_id"
}
```
**Why:** Without structure, journal becomes noise. Every model said publish needs a contract.

### Objective Field
Add `objective` to session/start response:
```json
{
  "session": {...},
  "rules": {...},
  "memory": {...},
  "environment": {...},
  "objective": {
    "current_task": "Deploy KSeF Agent v2",
    "priority": "high",
    "set_by": "human",
    "set_at": "2026-04-06"
  }
}
```
**Why:** "Agent knows the world but not the goal" (GPT). Without objective, agent has context but no direction.

### Rule Metadata
Add optional fields to rules:
```yaml
frozen:
  - id: arch-001
    text: "Agent always runs next to database (localhost)"
    source: security-architecture
    since: 2026-04-05
    rationale: "Network latency + credential exposure risk"
    expires_at: null          # null = never expires
    last_reviewed: 2026-04-05
    owner: "product-owner"
```
**Why:** "Models follow rules better when they understand intent" (Gemini). `rationale` reduces Rule Drift.

## v0.2.0 — Enforcement & Scale

### Compliance Loop
Before `/session/end`, agent MUST submit compliance report:
```json
{
  "session_id": "sess_001",
  "rules_verified": ["arch-001", "arch-006", "sec-001"],
  "rules_violated": [],
  "always_executed": ["qa-001", "qa-002"],
  "always_skipped": [],
  "reason_for_skips": null
}
```
Server can reject incomplete handoffs or flag as "risky".

**Why:** All 4 models independently said: rules must be verified procedurally, not remembered. "Self-policing protocol" (Grok).

### Conflict Detection
When agent publishes a decision, server checks last N entries for contradictions:
- Same topic, different conclusion → flag as `conflict`
- Agent notified: "Your decision contradicts evt_xyz from agent B"
- Human can resolve in panel

**Why:** 4/4 models raised this. Without it, two agents can unknowingly cancel each other's work.

### Context Freshness / TTL
Add metadata to journal entries:
```json
{
  "id": "evt_001",
  "freshness": "verified|stale|needs_refresh",
  "verified_at": "2026-04-06T10:00:00Z",
  "ttl_days": 30
}
```
On `/session/start`, server marks entries older than TTL as `stale`.

**Why:** "Memory becomes a junkyard of historically true information" (GPT). Agents need to know what's current.

### Context Compression
New endpoint: `POST /context/summarize`
- Generates condensed version of journal (e.g., every 10 sessions)
- Keeps full journal for audit, serves summary for onboarding
- Prevents token overload at scale

**Why:** At 1000+ entries, raw journal exceeds model context windows. All models flagged this.

### Presence / Heartbeat
- Agents publish periodic heartbeat during session
- Panel shows: "Claude: active (5 min ago)" / "Gemini: last seen 3 hours ago"
- Helps human know if agent lost context

## v0.3.0 — Ecosystem

### MCP Bridge
Expose ACP as MCP tool server. Agents that speak MCP get context automatically.

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
