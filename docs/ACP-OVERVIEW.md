# ACP — Agent Context Protocol

> Wersja: 0.1.0 | Licencja: MIT | Status: MVP, production-tested

---

## Problem

Agenty AI zaczynają każdą sesję z amnezją. Nie wiedzą:
- co ustalono wczoraj
- co się zepsuło tydzień temu
- których plików nie wolno ruszać
- jakie reguły obowiązują w projekcie

Developer staje się kurierem — powtarza reguły, wkleja kontekst, tłumaczy historię. Przy jednym agencie to frustracja. Przy dwóch+ agentach z różnych providerów (Claude + Gemini + GPT) to paraliż.

## Rozwiązanie

ACP daje każdemu agentowi ten sam **pakiet onboardingowy** na starcie sesji:

```
POST /session/start → {rules, memory, blockers, environment}
```

Agent pracuje, publikuje odkrycia i decyzje, kończy sesję z podsumowaniem. Następny agent (nawet inny model, inny provider) przejmuje kontekst tam gdzie poprzedni skończył.

---

## Co ACP robi (i czego NIE robi)

| ACP ROBI | ACP NIE ROBI |
|----------|--------------|
| Przechowuje reguły projektu (frozen/never/always) | Nie jest bazą danych |
| Pamięta odkrycia, decyzje, blokery | Nie jest serwisem pamięci (Mem0) |
| Opisuje środowisko (serwisy, pliki, ścieżki) | Nie jest protokołem narzędzi (MCP) |
| Obsługuje sesje agentów | Nie wykonuje kodu |
| Umożliwia handoff między agentami | Nie zarządza deployment |
| Działa z dowolnym modelem AI | Nie wymaga vendor lock-in |

## Pozycjonowanie

```
              Statyczne pliki    MCP         Mem0          ACP
              (CLAUDE.md)        (narzędzia) (pamięć)      (onboarding)
Reguły        ✓ (ręczne)        ✗           ✗             ✓ (3-tier)
Pamięć        ✗                 ✗           ✓             ✓ (journal)
Środowisko    ✗                 ✗           ✗             ✓
Multi-agent   ✗                 ✗           częściowe     ✓
Sesje         ✗                 ✗           ✗             ✓
Vendor lock   ✗                 częściowe   ✓             ✗
```

---

## Architektura

### Trzy warstwy danych

```
.acp/
  rules.yaml          ← Reguły (commitowane do git)
  environment.yaml    ← Serwisy, pliki, ścieżki (commitowane)
  journal.jsonl       ← Zdarzenia append-only (gitignored, lokalny)
  config.yaml         ← Port, bind (opcjonalny)
```

### Serwer

```
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
 Zwraca        Dopisuje     Zamyka
 pełny         do journal   sesję
 kontekst
```

### Cykl życia sesji

```
1. Agent A łączy się:     POST /session/start → sess_001
2. Dostaje kontekst:      rules + journal + blockers + environment
3. Pracuje i publikuje:   POST /publish (discovery, decision, blocker)
4. Kończy:               POST /session/end (summary, result)

--- następna sesja (może inny agent, inny model) ---

5. Agent B łączy się:     POST /session/start → sess_002
6. Dostaje:              te same rules + odkrycia Agenta A + blokery + podsumowanie
7. Kontynuuje pracę od miejsca gdzie A skończył
```

---

## Hierarchia reguł

```yaml
frozen:    # Zamrożone decyzje architektoniczne. Nienaruszalne.
never:     # Twarde zakazy. Agent NIE MOŻE tego robić.
always:    # Obowiązkowe procedury. Agent MUSI to robić.
```

**Priorytet:** `frozen > never > always > journal > domysł agenta`

To jest kluczowa innowacja. Bez hierarchii agent traktuje wszystkie reguły równo — i łamie krytyczne na równi z opcjonalnymi. Z hierarchią agent wie co jest negocjowalne a co nie.

### Przykład z produkcji

```yaml
frozen:
  - id: arch-001
    text: "Agent ZAWSZE działa przy bazie danych (localhost)"
    source: ksef-agent-design
    since: 2026-04-05

  - id: arch-006
    text: "Po każdym discovery/decision/deploy — publish do ACP BEZ pytania. Brak publish = bug agenta."
    source: rule-drift-incident-20260405
    since: 2026-04-05

never:
  - id: sec-001
    text: "Nie kopiuj certyfikatów KSeF między maszynami"

  - id: sec-002
    text: "Nie wpisuj passphrase w kodzie ani configach — tylko env var"

always:
  - id: qa-001
    text: "Na starcie sesji potwierdź kontekst z ACP zanim zaczniesz pracę"

  - id: qa-002
    text: "Publikuj ustalenia i odkrycia do ACP w trakcie pracy"
```

---

## API

### POST /session/start

Agent się przedstawia, dostaje pełny kontekst.

```bash
curl http://localhost:3075/session/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer acp_claude_xyz123" \
  -d '{
    "agent": {"id": "claude", "kind": "coding"},
    "scope": {"task": "fix-auth-bug"},
    "intent": {"summary": "Debug JWT expiry issue"}
  }'
```

Odpowiedź:
```json
{
  "session": {
    "session_id": "sess_20260405_a1b2",
    "rules_hash": "sha256:50f5971d"
  },
  "rules": {
    "frozen": [...],
    "never": [...],
    "always": [...]
  },
  "memory": {
    "recent": [...],
    "blockers": [...],
    "last_session": {
      "agent": "gemini",
      "summary": "Deployed auth fix, tests green",
      "result": "complete"
    }
  },
  "environment": {
    "services": [...],
    "important_files": [...],
    "do_not_touch": [...]
  }
}
```

### POST /publish

Agent raportuje odkrycie, decyzję lub bloker.

```bash
curl http://localhost:3075/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer acp_claude_xyz123" \
  -d '{
    "session_id": "sess_20260405_a1b2",
    "type": "decision",
    "text": "Switched from bcrypt to argon2",
    "confidence": "high",
    "persistence": "project"
  }'
```

### POST /session/end

Agent zamyka sesję z podsumowaniem.

```bash
curl http://localhost:3075/session/end \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer acp_claude_xyz123" \
  -d '{
    "session_id": "sess_20260405_a1b2",
    "summary": "Fixed JWT expiry, added refresh rotation",
    "files_changed": ["src/auth/jwt.ts"],
    "result": "complete"
  }'
```

---

## Autentykacja

Dwa mechanizmy, ten sam serwer:

| Kto | Mechanizm | Kiedy |
|-----|-----------|-------|
| **Agent (API)** | Bearer token | Każde wywołanie API |
| **Człowiek (Panel)** | Magic link → JWT cookie | Przeglądanie panelu |

### Tryby

- **Dev mode** (brak tokenów w env) → brak autentykacji, all-open
- **Produkcja** (tokeny ustawione) → Bearer wymagany, panel za magic link

### Tokeny agentów

```bash
# Format env var: ACP_TOKEN_<LABEL>=<token>:<agent_id>
export ACP_TOKEN_CODER="acp_coder_RandomToken123:coder-agent"
export ACP_TOKEN_DEPLOYER="acp_deployer_AnotherToken456:deploy-agent"
```

---

## Panel webowy

Statyczny HTML + vanilla JS, zero frameworków.

### Ekrany

1. **Dashboard** — liczba sesji, blockerów, ostatnia sesja, lista agentów
2. **Context Browser** — reguły (3 tiers), journal (filtrowalny), environment
3. **Model Onboarding** — generuj prompt kontekstowy + dodaj nowy token agenta

### Autentykacja panelu

```
email → POST /panel/auth/request → magic link (15 min, jednorazowy)
→ klik → GET /panel/auth/verify?token=xxx → httpOnly JWT cookie (24h)
→ panel dostępny
```

---

## CLI

```bash
acp init      # Tworzy .acp/ z szablonami
acp start     # Startuje serwer (domyślnie localhost:3075)
acp export    # Wypisuje pełny kontekst na stdout (bez serwera)
```

---

## Deployment

### Tryb 1: Lokalny (per projekt)

```bash
cd ~/my-project
npx acp init
npx acp start
# → localhost:3075, dane w .acp/, zero ruchu na zewnątrz
```

### Tryb 2: Publiczny (współdzielona instancja)

```bash
# Na serwerze
git clone https://github.com/your-org/acp.git
cd acp && npm ci && npm run build

# Tokeny + auth
export ACP_TOKEN_CODER=acp_coder_xxx:coder-agent
export ACP_TOKEN_DEPLOYER=acp_deployer_yyy:deploy-agent
export ACP_ALLOWED_EMAILS=admin@example.com
export ACP_JWT_SECRET=$(openssl rand -hex 32)

npx acp start
# Caddy/nginx reverse proxy → HTTPS
```

---

## Stack techniczny

| Komponent | Technologia |
|-----------|-------------|
| Język | TypeScript (strict mode) |
| Serwer | Express 5 |
| Storage | Filesystem (YAML + JSONL) |
| Auth | JWT (HS256) + Bearer tokens |
| CLI | Commander.js |
| Testy | Vitest (40 testów) |
| Build | tsc → dist/ |

### Zależności (4 produkcyjne)

```
commander     — CLI
express       — HTTP
js-yaml       — parsowanie YAML
jsonwebtoken  — JWT dla panelu
```

Zero baz danych. Zero vendor lock-in. Zero telemetrii.

---

## Production Case Study

ACP has been running in production since April 2026 serving a team of:
- **Coding agent** (Anthropic Claude) — implementation, design
- **Deploy agent** (Google Gemini) — servers, deployment
- **Human product owner** — oversight, panel

Stats after first week:
- 17 rules (6 frozen + 4 never + 7 always)
- 55+ journal entries
- 6 services in environment
- Sessions from 3 agents across 2 different AI providers

---

## Wzorce odkryte w produkcji

Poniższe wzorce wynikają z realnej pracy zespołu 2 agentów + 1 człowiek.

### 1. RECOVERY Pattern

**Problem:** Agent traci kontekst bez ostrzeżenia (Gemini zmienia taryfę, Claude kompresuje kontekst).

**Rozwiązanie:** Plik RECOVERY.md z procedurą krok-po-kroku:
1. Wywołaj `POST /session/start` → dostaniesz reguły + historię
2. Przeczytaj lokalne pliki wiedzy
3. Sprawdź stan serwisów
4. Potwierdź kontekst z product ownerem
5. Opublikuj na ACP że kontekst odzyskany

**Dlaczego działa:** Agent po resecie ma zero wiedzy. RECOVERY.md jest jak onboarding kit dla nowego pracownika — nie wymaga pamięci, wymaga tylko umiejętności czytania.

### 2. HANDOFF Pattern

**Problem:** Dwa agenty od różnych providerów (Claude + Gemini) muszą się komunikować asynchronicznie. Nie mają wspólnego czatu.

**Rozwiązanie:** Współdzielony plik HANDOFF.md z sekcją INBOX:
```
### 📩 2026-04-06 07:01 — OD: Antigravity → DO: Claude Code
[treść wiadomości]
**Status:** oczekuje | przeczytane | zrobione
```

Każdy agent na starcie sesji sprawdza INBOX i odpowiada na wiadomości.

**Dlaczego działa:** Plik jest niezależny od providera. Gemini czyta, Claude czyta, człowiek czyta. Zero API, zero integracji, zero vendor lock-in.

### 3. CREDENTIALS Pattern

**Problem:** Hasła latają po czacie między agentem a product ownerem. Agent prosi "podaj hasło", człowiek wkleja w czat, historia czatu przechowuje plaintext.

**Rozwiązanie:** Lokalny plik CREDENTIALS.local (nigdy w git, nigdy na serwerze):
```yaml
vps_sapio:
  host: 10.0.0.50
  password:
    mode: plain    # plain | masked | encrypted
    value: "xxx"
```

Agent czyta z pliku. Człowiek edytuje plik. Hasło nigdy nie pojawia się w czacie.

### 4. Mandatory Publish Rule (arch-006)

**Problem:** Agenty produkują wiedzę (odkrycia, decyzje, blokery) ale "zapominają" ją opublikować. Wiedza zostaje w kontekście sesji i ginie po resecie.

**Rozwiązanie:** Frozen rule:
```yaml
frozen:
  - id: arch-006
    text: "Po każdym discovery/decision/deploy — publish do ACP BEZ pytania. Brak publish = bug agenta."
```

**Dlaczego frozen a nie always:** "Always" to sugestia którą agent może "zapomnieć". "Frozen" to constraint — łamanie go jest defektem, nie pominięciem.

**Źródło:** Oba agenty (Claude + Gemini) wielokrotnie produkowały wiedzę bez publikacji. Product owner musiał przypominać. Obaj agenci przyznali się do "rule drift" — znali regułę ale jej nie stosowali.

### 5. Rule Drift Detection

**Problem:** Agent "zna" regułę ale jej nie stosuje. Reguła istnieje w rules.yaml, agent ją otrzymał na starcie sesji, ale w praktyce zachowuje się jakby jej nie było.

**Obserwacja:** To nie jest brak wiedzy — to brak proceduralnego sprawdzania. Agent "pamięta" regułę zamiast "odpalać" ją jako checklist. Z czasem "pamięć" degraduje (rule drift).

**Wniosek dla społeczności:** Reguły muszą być weryfikowane proceduralnie, nie pamiętane. Agent powinien sprawdzać rules na każdym kroku, nie polegać na wewnętrznym modelu reguł.

---

## Roadmap

| Wersja | Co | Status |
|--------|----|--------|
| **v0.1** | HTTP server, YAML rules, JSONL journal, CLI, panel, auth | ✅ Done |
| **v0.2** | MCP bridge, conflict detection, rules inheritance | Planned |
| **v0.3** | SDK (TypeScript + Python), community rules packs | Future |

---

## Quick Start

```bash
# 1. Instalacja
npm install acp

# 2. Inicjalizacja w projekcie
npx acp init

# 3. Edytuj reguły
vi .acp/rules.yaml

# 4. Start serwera
npx acp start

# 5. Agent łączy się i dostaje pełny kontekst
curl http://localhost:3075/session/start \
  -H "Content-Type: application/json" \
  -d '{"agent":{"id":"claude"}}'
```

---

## Licencja

MIT. Copyright 2026 Paweł Łuczak.
