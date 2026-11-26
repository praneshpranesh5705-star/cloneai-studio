# CloneAI Studio

An all-in-one AI creation workspace: build agents, give them your own knowledge, and chat with them — with every answer citing the documents it used.

Built with Next.js 15 (App Router), React 19, TypeScript and Supabase.

---

## What actually works

This repository used to be a UI mockup: every nav button showed a "coming soon" toast, no data was ever saved, and the project did not install or build. It is now a working application.

| Feature | Status |
|---|---|
| Email/password auth (Supabase) | ✅ Working |
| Create, edit, delete agents | ✅ Working |
| Per-agent instructions, model, temperature | ✅ Working |
| Knowledge base — add & delete documents | ✅ Working |
| Retrieval — TF-IDF chunk scoring, top 4 passages | ✅ Working |
| Streaming chat with citations | ✅ Working |
| Conversation history persisted | ✅ Working |
| Usage log (one row per model call) | ✅ Working |
| Dashboard with live counts | ✅ Working |
| Demo mode when no API key is set | ✅ Working |
| Voice Studio | ⛔ Not built — the page says so |
| Avatar Studio | ⛔ Not built — the page says so |
| Website Builder | ⛔ Not built — the page says so |
| Billing / subscriptions | ⛔ Not built — usage is logged, not charged |

The three studios are deliberately honest placeholder pages that list what each would require. They do not pretend to work.

## Demo mode

If no model API key is configured, the app runs in **demo mode**: the streaming UI, citations and persistence all work, but replies are generated locally by a deterministic stub. A banner appears on every relevant page and the stub's own text says it is not a real answer. Add a key and the banner disappears.

## Stack

- **Next.js 15** App Router, server components for data, route handlers for the API
- **React 19** with a single client component tree for chat streaming
- **Supabase** — Postgres, Auth, Row Level Security
- **lucide-react** icons, hand-written CSS (no UI framework)

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill it in — see SETUP.md
npm run dev
```

Open http://localhost:3000. Without Supabase configured you will see a setup screen explaining what to add.

**Full instructions, including the database SQL and every environment variable: [SETUP.md](./SETUP.md).**

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests for retrieval, prompt assembly and validation |

> **Node version.** Use Node 22 or newer. `@supabase/supabase-js` prints a
deprecation warning on Node 20 and will stop supporting it. The build works on
20 today; 22 is what you should deploy on.

## Project layout

```
app/
  page.tsx                      Dashboard — live counts from the database
  agents/                       List, create, and the per-agent page
  agents/[id]/page.tsx          Chat + Knowledge + Settings tabs
  knowledge/                    All documents across agents
  settings/                     Account + which providers are configured
  usage/                        Model call log
  help/                          FAQ
  studios/[slug]/               Honest "not built yet" pages
  setup/                        Shown when Supabase env vars are missing
  login/ signup/                Auth screens
  robots.ts sitemap.ts          Crawler rules — public pages only
  api/
    chat/route.ts               Streaming NDJSON chat endpoint
    agents/route.ts             List + create
    agents/[id]/route.ts        Get + update + delete
    agents/[id]/documents/      List + create documents
    documents/[id]/route.ts     Delete a document
  auth/callback/route.ts        Email confirmation exchange
  auth/signout/route.ts         Sign out
components/                     App shell, chat, forms, panels
lib/
  config.ts                     Env reading + provider registry (never throws)
  providers.ts                  OpenAI / OpenRouter / Anthropic / Gemini / demo, all streaming
  retrieval.ts                  Chunking + TF-IDF scoring
  prompt.ts                     System prompt assembly + history trimming
  validation.ts                 Input validation shared by API and forms
  data.ts                       Server-side queries
  types.ts                      Shared types
supabase/schema.sql             The whole database, idempotent
supabase/profiles.sql           Legacy, optional — schema.sql already covers it
tests/logic.test.ts             24 unit tests
middleware.ts                   Session refresh + route protection
AUDIT.md                        What was verified, and what was fixed
```

## How the chat works

1. `POST /api/chat` with `{ agentId, message, conversationId? }`
2. The route validates input, confirms the caller owns the agent (RLS also enforces this), and creates a conversation if none was given.
3. `retrieve()` chunks every document for that agent, scores each chunk against the message using TF-IDF with saturating term frequency and length normalisation, and keeps the top 4.
4. Those passages go into the system prompt as numbered `[1] … [4]` blocks, alongside the agent's instructions and an explicit instruction not to invent facts.
5. The model's response is streamed back as newline-delimited JSON events: `meta`, `citations`, `delta`, `done`, `error`.
6. The assistant message (with its citations) and a usage row are written to Postgres.

The user turn is persisted **before** streaming starts, so a dropped connection still leaves an accurate transcript.

## Security model

- **Row Level Security on every table.** A signed-in user can only read their own agents, documents, conversations and messages. Public agents are readable but not writable by others.
- **Anon key in the browser is safe** — that is what RLS is for. The service-role key is never referenced anywhere in this codebase.
- **API keys for model providers are server-only** and read from the environment at request time. No `NEXT_PUBLIC_` prefix on any secret.
- **All writes go through route handlers** that re-check `auth.getUser()` and re-validate input server-side; client-side validation is a convenience, not a control.

Verified by running the schema against Postgres 15 and attacking it: an authenticated user attempting to insert an agent owned by someone else gets `new row violates row-level security policy`, and reads of another user's documents, messages and usage rows return zero.

## Limits you should know

- **Retrieval is lexical, not semantic.** No embeddings. It works well for keyword-ish questions and document sets of tens of documents. A question phrased with entirely different vocabulary from the source will miss.
- **No file uploads yet.** Knowledge is pasted text. PDF/DOCX ingestion would need a parser and a storage bucket.
- **No streaming cancellation on the server.** The client can stop reading; the provider request is not aborted, so the tokens are still billed.
- **Usage is a log, not a meter.** Nothing enforces quotas.

## License

MIT — see [LICENSE](./LICENSE).

## Audit log

This repository was re-verified end to end on 2026-11-26. What was checked and
what was found is recorded in [AUDIT.md](./AUDIT.md).
