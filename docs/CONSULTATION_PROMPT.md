# ACP Consultation Prompt

> Wklej ten prompt do dowolnego modelu AI (ChatGPT, Grok, Gemini, Copilot).
> Cel: weryfikacja koncepcji ACP z perspektywy modelu który byłby użytkownikiem tego protokołu.

---

## PROMPT:

Jestem twórcą ACP (Agent Context Protocol) — open-source protokołu który rozwiązuje problem "amnezji agentów AI".

**Repo:** https://github.com/pawelsokaris-sudo/acp-public

### Problem

Agenty AI (Claude, Gemini, GPT, Copilot) zaczynają każdą sesję z zerowym kontekstem. Nie wiedzą co ustalono wczoraj, co się zepsuło, jakie reguły obowiązują. Developer staje się kurierem — powtarza to samo w kółko. Przy 2+ agentach od różnych providerów to paraliż.

### Rozwiązanie ACP

Lekki HTTP serwer (Node.js, 4 zależności, zero baz danych) który daje każdemu agentowi pakiet onboardingowy na starcie sesji:

```
POST /session/start → {rules, memory, blockers, environment}
```

Trzy kluczowe innowacje:

1. **3-tier rule hierarchy:** `frozen > never > always`. Frozen = nienaruszalne (decyzje architektoniczne). Never = twarde zakazy. Always = obowiązkowe procedury. Agent wie co jest negocjowalne a co nie.

2. **Session lifecycle:** Agent startuje sesję → pracuje i publikuje odkrycia/decyzje/blokery → kończy z podsumowaniem. Następny agent (nawet inny model) przejmuje tam gdzie poprzedni skończył.

3. **Vendor-agnostic:** Działa z każdym modelem AI. Dane to YAML + JSONL na dysku. Zero vendor lock-in.

### Wzorce z produkcji (2 agenty + 1 człowiek)

Testowaliśmy ACP w produkcji z zespołem: Claude Code (implementacja) + Gemini (deploy) + człowiek (product owner).

Odkryte wzorce:

- **RECOVERY pattern** — procedura odzyskania kontekstu po resecie agenta (plik krok-po-kroku)
- **HANDOFF pattern** — async komunikacja agent↔agent przez współdzielony plik (INBOX)
- **CREDENTIALS pattern** — lokalne hasła w pliku, nie w czacie
- **Mandatory publish (arch-006)** — "brak publish = bug agenta" jako frozen rule
- **Rule Drift** — agent "zna" regułę ale jej nie stosuje. Reguły muszą być weryfikowane proceduralnie, nie pamiętane.

### Pytania do Ciebie

Odpowiedz z perspektywy **modelu AI który byłby użytkownikiem ACP** (dostajesz context na starcie sesji, publikujesz odkrycia, kończysz sesję):

1. **Czy ten protokół rozwiązuje realny problem?** Czy brak kontekstu między sesjami jest dla Ciebie faktycznym ograniczeniem?

2. **Hierarchia reguł (frozen/never/always)** — czy to dobra abstrakcja? Czy 3 poziomy wystarczą? Brakuje czegoś?

3. **Rule Drift** — my odkryliśmy że agenty "znają" reguły ale ich nie stosują. Z Twojej perspektywy — dlaczego to się dzieje? Jak byś to rozwiązał?

4. **Czego brakuje?** Co byś dodał do ACP żeby był dla Ciebie bardziej użyteczny?

5. **HANDOFF pattern** (agenty komunikują się przez plik, nie przez wspólny czat) — czy to dobre rozwiązanie? Jak byś to ulepszył?

6. **Gdybyś zaczynał sesję i dostawał pakiet ACP** — jaki format danych byłby dla Ciebie NAJŁATWIEJSZY do przetworzenia? JSON? YAML? Markdown? Mix?

7. **Jedno pytanie którego powinienem się obawiać** — co może pójść nie tak z ACP w skali (100 agentów, 1000 reguł, duże zespoły)?

8. **Jedna rzecz którą byś zmienił** — gdybyś mógł zmienić jedną rzecz w ACP, co by to było?

Odpowiedz szczerze, krytycznie, z perspektywy technicznej. Nie chcę walidacji — chcę prawdziwych problemów.
