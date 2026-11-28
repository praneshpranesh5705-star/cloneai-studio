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
| Knowledge base — paste text, or upload PDF / DOCX | ✅ Working |
| Retrieval — TF-IDF chunk scoring, top 4 passages | ✅ Working |
| Streaming chat with citations | ✅ Working |
| Conversation history persisted | ✅ Working |
| Usage log (one row per model call) | ✅ Working |
| Dashboard with live counts | ✅ Working |
| Demo mode when no API key is set | ✅ Working |
| Voice Studio text-to-speech | 🟡 Implemented — requires a funded OpenAI API account and `OPENAI_API_KEY` |
| Website Builder — generate, preview, revise, save, publish | ✅ Working — needs any one model key |
| Avatar Studio — avatar image | ✅ Working — needs `GEMINI_API_KEY` or `OPENAI_API_KEY` |
| Avatar Studio — talking video | 🟡 Implemented — needs `GEMINI_API_KEY` with paid-tier access |
| Billing / subscriptions | ⛔ Not built — usage is logged, not charged |

Website Builder and Avatar Studio are both implemented; see [Website Builder](#website-builder) and [Avatar Studio](#avatar-studio) below.

## Demo mode

If no model API key is configured, the app runs in **demo mode**: the streaming UI, citations and persistence all work, but replies are generated locally by a deterministic stub. A banner appears on every relevant page and the stub's own text says it is not a real answer. Add a key and the banner disappears.

## Does the AI actually work?

**The code path is real and tested. The live deployment is in demo mode, because no key is set on it.**

What that means precisely:

| Question | Answer |
|---|---|
| Is there a real model integration? | Yes — four of them: OpenAI, OpenRouter, Anthropic, Gemini |
| Do the adapters build correct requests? | Yes — verified against mock SSE servers speaking each vendor's exact wire format |
| Does streaming parse correctly? | Yes — all four shapes tested, including Anthropic `ping` frames and OpenAI `[DONE]` |
| Do vendor errors surface readably? | Yes — a 401 body becomes "Invalid API key provided." |
| Has a live vendor ever answered? | **No.** No key was available in the build environment |
| Is the public deployment answering with AI? | **No.** It has no key, so it serves demo replies and says so |

The distinction matters: the integration is not a stub pretending to be an API client. It is a working client that has never been pointed at a live endpoint. The first real call happens when you add a key.

### How to leave demo mode

1. Get a key from any one of: [OpenAI](https://platform.openai.com/api-keys), [OpenRouter](https://openrouter.ai/keys), [Anthropic](https://console.anthropic.com/settings/keys), [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Add it to `.env.local` (local) or Vercel → Settings → Environment Variables (deployed), using the exact name from the table below.
3. Redeploy. `/settings` shows a green dot next to the provider once it is detected.

| Provider | Variable | Default model |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| OpenRouter | `OPENROUTER_API_KEY` | `openai/gpt-4o-mini` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` |
| Google Gemini | `GEMINI_API_KEY` | `gemini-3.8-flash` |

Set `AI_PROVIDER` to force one when several keys are present.

### Provider resolution

An agent stores the provider it was created with, but that is not always what runs. `effectiveProvider()` in `lib/config.ts` decides, and both the agent page and `/api/chat` call it, so the banner and the actual call can never disagree:

- A **demo** agent is promoted to a real provider when this deployment has a key — so an agent saved before you added a key starts working immediately.
- A **real** provider with **no key** falls back to demo rather than throwing, and the banner says which provider is missing.

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
  studios/[slug]/               Voice Studio, Avatar Studio, Website Builder
  p/[slug]/route.ts             Serves a published generated page, publicly
  setup/                        Shown when Supabase env vars are missing
  login/ signup/                Auth screens
  robots.ts sitemap.ts          Crawler rules — public pages only
  api/
    chat/route.ts               Streaming NDJSON chat endpoint
    voice/route.ts              Authenticated text-to-speech endpoint
    website-builder/route.ts    Generate a page from a brief (any provider)
    website-builder/save/       Save a draft, or publish it for public reading
    avatar/image/               Generate an avatar portrait (Gemini or OpenAI)
    avatar/video/               Start + poll a talking-avatar video job (Gemini Omni)
    avatar/video/download/      Stream the finished MP4
    agents/route.ts             List + create
    agents/[id]/route.ts        Get + update + delete
    agents/[id]/documents/      List + create documents
    agents/[id]/documents/upload/  Extract text from a PDF or DOCX and save it
    documents/[id]/route.ts     Delete a document
  auth/callback/route.ts        Email confirmation exchange
  auth/signout/route.ts         Sign out
components/                     App shell, chat, forms, panels, Voice Studio
lib/
  config.ts                     Env reading + provider registry (never throws)
  providers.ts                  OpenAI / OpenRouter / Anthropic / Gemini / demo, all streaming
  complete.ts                   Non-streaming completion for the studios, with budget + timeout
  avatar.ts                     Avatar rules: provider choice, validation, error mapping
  avatar-providers.ts           Gemini/OpenAI image + Gemini Omni video adapters
  website.ts                    Page validation, sanitising, titles and slugs
  retrieval.ts                  Chunking + TF-IDF scoring
  prompt.ts                     System prompt assembly + history trimming
  validation.ts                 Input validation shared by API and forms
  data.ts                       Server-side queries
  extract.ts                    PDF/DOCX text extraction + error codes
  types.ts                      Shared types
supabase/schema.sql             The whole database, idempotent
supabase/profiles.sql           Legacy, optional — schema.sql already covers it
tests/logic.test.ts             24 unit tests (retrieval, prompt, validation)
tests/extract.test.ts           14 tests — PDF/DOCX extraction vs real files
tests/providers.test.ts          7 tests — all four provider adapters vs mock SSE
tests/ai-path.test.ts            8 tests — turn alternation + provider resolution
tests/website.test.ts           26 tests — page validation, sanitising, slugs
tests/complete.test.ts           5 tests — completion wrapper vs a mock provider
tests/avatar.test.ts            40 tests — avatar rules + both image adapters + video polling
tests/e2e-avatar.mjs            6 checks against a built server
tests/e2e-website.mjs           16 checks against a built server
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

## Adding knowledge from a file

On an agent's **Knowledge** tab, switch to **Upload file** and drop in a PDF or DOCX
(up to 4 MB) — or click the box to browse. The text is extracted server-side and
saved as a normal document, so retrieval and citations work exactly as they do
for pasted text. The title is taken from the filename and can be edited before
saving.

Failures are reported in the panel, never as a crash: a wrong file type, a file
over 4 MB, a password-protected or corrupt PDF, and a scanned PDF with no
selectable text each get their own message. The last one tells you the file
looks like a scan and needs OCR first.

## Security model

- **Row Level Security on every table.** A signed-in user can only read their own agents, documents, conversations and messages. Public agents are readable but not writable by others.
- **Anon key in the browser is safe** — that is what RLS is for. The service-role key is never referenced anywhere in this codebase.
- **API keys for model providers are server-only** and read from the environment at request time. No `NEXT_PUBLIC_` prefix on any secret.
- **All writes go through route handlers** that re-check `auth.getUser()` and re-validate input server-side; client-side validation is a convenience, not a control.
- **Uploads are verified before parsing.** The format is read from the file's leading bytes, not its extension, so a renamed file is rejected rather than fed to the parser.

Verified by running the schema against Postgres 15 and attacking it: an authenticated user attempting to insert an agent owned by someone else gets `new row violates row-level security policy`, and reads of another user's documents, messages and usage rows return zero.

## Limits you should know

- **Retrieval is lexical, not semantic.** No embeddings. It works well for keyword-ish questions and document sets of tens of documents. A question phrased with entirely different vocabulary from the source will miss.
- **Uploads are extracted, not stored.** A PDF or DOCX is parsed in the request and its plain text is saved as a document. The original file is not kept, so there is no re-download and no OCR — a scanned, image-only PDF has no selectable text and is rejected with a message saying so.
- **No streaming cancellation on the server.** The client can stop reading; the provider request is not aborted, so the tokens are still billed.
- **Usage is a log, not a meter.** Nothing enforces quotas.
- **No live model call has been made.** The adapters are tested against mock SSE servers, not against the vendors. See [AUDIT-AI.md](./AUDIT-AI.md).

## License

MIT — see [LICENSE](./LICENSE).

## Audit log

This repository was re-verified end to end on 2026-11-26. What was checked and
what was found is recorded in [AUDIT.md](./AUDIT.md).

The AI path specifically — whether the chat answers with a real model or only
demo — was audited separately in [AUDIT-AI.md](./AUDIT-AI.md).


## Voice Studio

Voice Studio currently supports text-to-speech with nine preset voices, a speaking-style instruction, in-browser playback and MP3 download. It uses the authenticated server route `POST /api/voice`; the OpenAI API key stays on the server and is never exposed to the browser.

To enable it, add `OPENAI_API_KEY` to Vercel → Project Settings → Environment Variables for Production (and Preview/Development if desired), then redeploy. The OpenAI API account must have billing/payment details and available API credit. ChatGPT Plus/Free subscriptions and ChatGPT message limits are separate from API billing. Voice cloning of a real person is not part of this text-to-speech feature; obtain explicit permission before using someone's voice or likeness.

The initial integration uses OpenAI's `gpt-4o-mini-tts` model. Check the current OpenAI audio documentation before extending this integration or selecting a replacement model.


## Website Builder

Open **Studios → Website Builder** (`/studios/website`).

1. Describe the site you want and press **Generate website**. The model returns one complete HTML document.
2. Preview it at desktop or mobile width, or inspect the generated source.
3. Ask for a change in plain language and press **Apply changes** — the model revises the page it just produced.
4. **Save draft** stores it privately. **Publish** makes it readable at `/p/<slug>` by anyone with the link, no sign-in required.
5. **Download** gets you a standalone `.html` file you can host anywhere.

It works with whichever of `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is set — the first one found is used, or name one explicitly with `AI_PROVIDER`. Unlike chat, there is no demo fallback: without a key the page says which variable to add rather than pretending to build something.

**What the generated page cannot do.** Output is sanitised before it is stored or previewed: `<script>` blocks, inline `on*` handlers, `javascript:` URLs, iframes and meta-refresh are removed. A published page is served from `/p/<slug>` with a strict Content-Security-Policy (`script-src 'none'`), `X-Frame-Options: DENY` and `nosniff`, so it cannot run script, read your cookies, or frame the app. Generated code never executes on the application server.

**Security model.** `websites` is the only table with an anonymous read policy, and it is narrow: `published = true` rows are world-readable, drafts are owner-only. Owners alone can insert, update or delete, enforced by four RLS policies verified against real users (see `tests/sql/websites-rls.sql`).

**Requires the `websites` table.** If you created your database before this feature existed, run `supabase/schema.sql` again — it is idempotent and adds the table without touching existing rows.


## Avatar Studio

Open **Studios → Avatar Studio** (`/studios/avatar`). Two tabs:

**Avatar image.** Describe the portrait, pick a style and a shape, press **Generate avatar image**. The result can be downloaded as a PNG, or sent straight to the video tab with **Animate this avatar**.

**Talking video.** Upload a photo (JPEG/PNG/WebP, under 4 MB), type the words the avatar should speak, press **Generate talking video**. The photo is downscaled and re-encoded in the browser before upload, so a large phone photo still works. Rendering takes 30–90 seconds; the panel shows elapsed time and then plays the MP4, which can be downloaded.

### Which provider does what

| Capability | Providers | Default model | Override |
|---|---|---|---|
| Avatar image | Gemini, OpenAI | `gemini-nano-banana-2.1` / `gpt-image-2.5-sunburst` | `AVATAR_IMAGE_MODEL` |
| Talking video | Gemini only | `gemini-omni-1.2-flash` | `AVATAR_VIDEO_MODEL` |

Gemini is preferred for images when both keys are present, because it takes an explicit aspect ratio. Set `AVATAR_IMAGE_PROVIDER=openai` to force the other. Forcing a provider whose key is missing falls back to the one that is configured rather than failing.

**Why video is Gemini-only.** OpenAI's Sora 2 models and the entire `/v1/videos` API were shut down on 2026-09-24, so there is no OpenAI video endpoint left to call. Offering a button that could not work would be worse than saying so.

### What the panel tells you

The page resolves both capabilities on the server before rendering, so it states plainly which one is connected instead of letting you find out by pressing a button:

- **Connected** — a green check naming the model that will be used.
- **Not connected** — an amber notice naming the exact environment variable to add.

Failures are reported in the panel, never as a crash: a rejected key, an account with no credit, a rate limit, a model your key cannot use, a content-policy refusal, a timeout, and a job that finishes without a video file each get their own message.

### Cost

Images are roughly **$0.03–$0.05** each. Video is billed per second of output: a 5-second 720p clip is about **$0.35** on Gemini Omni 1.2 Flash. Talking video has no free tier — it needs paid-tier Gemini access. Set a hard spend limit in the provider console before using it.

### Limits

- **Video is 5 seconds at 720p, portrait.** Longer or higher-resolution output costs proportionally more; change `VIDEO_SECONDS` / `VIDEO_RESOLUTION` in `lib/avatar.ts` if you want that.
- **Nothing is stored.** Generated images and videos are returned to the browser and not saved to Supabase or disk. Download what you want to keep.
- **No lip-sync guarantee.** The model is asked to synchronise mouth movement to the script; exact wording and sync quality vary between runs.
- **Consent is your responsibility.** The panel says so, but nothing enforces it. Use only photos of yourself or people who have agreed.
