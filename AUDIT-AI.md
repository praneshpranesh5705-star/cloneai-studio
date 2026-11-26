# Audit — 2026-11-26 (round 2: does the AI actually work?)

A fresh clone was taken again and the AI path was traced end to end. This round
answers one question: **is the chat answering with a real model, or only demo?**

## Answer

**The integration is real and now tested. The live deployment is in demo mode,
because no provider key is set on it.**

No key was available in the build environment, so a live vendor call could not be
made. Instead the adapters were tested against local HTTP servers that speak each
vendor's exact SSE wire format. That proves request shape, auth placement,
streaming parse and error propagation — it does not prove a live vendor accepts
the call. Both facts are stated in the README.

## How the AI path was checked

| Check | Method | Result |
|---|---|---|
| Installs from a clean clone | `git clone` → `npm install` | ✅ exit 0 |
| Typechecks | `tsc --noEmit` | ✅ clean |
| Lints | `eslint .` | ✅ clean |
| Unit tests | `npm test` | ✅ **39/39 pass** (was 24) |
| Production build | `npm run build` | ✅ 21 routes |
| Runs | `npm start` | ✅ ready in 725 ms |
| Routes respond | `curl` | ✅ `/setup` 200, protected routes 307 → `/setup` |
| **OpenAI adapter** | Mock SSE server, OpenAI wire format | ✅ assembles `"Hello from OpenAI"` |
| **OpenRouter adapter** | Same compatible path | ✅ assembles correctly |
| **Anthropic adapter** | Mock SSE, `content_block_delta` + `ping` frames | ✅ ignores pings, assembles text |
| **Gemini adapter** | Mock SSE, `candidates[].content.parts` | ✅ assembles text |
| **Missing key** | Call with no env var | ✅ throws naming the env var |
| **Vendor error** | Mock 401 with vendor error body | ✅ surfaces `"Invalid API key provided."` |
| **Demo provider** | No key | ✅ streams and says it is not real AI |
| Model names are real | Web check against vendor docs | ✅ `gemini-3.8-flash`, `claude-haiku-4-5-20251001` both current |

## Bugs found and fixed

### 1. Consecutive same-role turns broke Anthropic and Gemini

`trimHistory()` dropped a leading assistant turn but did nothing about two user
turns in a row. That state is reachable: if an assistant reply fails to persist
(provider error, dropped connection), the transcript holds two adjacent user
turns. OpenAI tolerates it; **Anthropic and Gemini both reject the request
outright** — so one failed turn would poison the rest of that conversation on
those providers.

Proven before fixing:

```
INPUT : user,user
OUTPUT: user,user
CONSECUTIVE SAME ROLE: true
```

Fixed by merging consecutive same-role turns rather than dropping them, so no
user text is lost. Now covered by two regression tests.

### 2. The demo banner could describe the wrong provider

The agent page computed `demo = agent.provider === "demo"` while `/api/chat`
computed its own answer with different logic. An agent recorded as `demo` on a
deployment that *has* a key would really call OpenAI, but the page still showed
"Demo mode. No model key is configured" — the opposite of the truth.

Fixed by extracting `effectiveProvider()` / `effectiveModel()` into `lib/config.ts`
and calling them from both places, so the banner and the actual call cannot
disagree. The banner now also distinguishes "no key at all" from "your chosen
provider's key is missing".

### 3. A missing key produced a hard error instead of a labelled fallback

Previously, an agent set to `anthropic` on a deployment without
`ANTHROPIC_API_KEY` threw mid-stream. Now it falls back to demo and the banner
names the missing provider.

## What is still not verified

- **A live model call.** No key was available. The adapters are tested against
  mock servers, not against OpenAI/Anthropic/Gemini themselves.
- **A live Supabase project.** The schema was run against Postgres 15 with
  stubbed `auth.users` and `auth.uid()`. The auth round-trip has never executed
  against a real project.
- **The deployed site with credentials.** The live URL serves the setup screen
  correctly, but has no Supabase project or model key attached.
