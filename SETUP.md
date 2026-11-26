# Setup

Ten minutes end to end. You will create a Supabase project, run one SQL file, and set two environment variables.

Until you do this, the app shows a setup screen instead of erroring — it is designed to degrade rather than break.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project**. Pick a region close to your users (Mumbai for India).
3. Save the database password somewhere safe. You will not need it for this app, but you cannot recover it.
4. Wait ~2 minutes for provisioning.

The free tier is enough. Nothing here needs a paid plan.

## 2. Run the schema

1. In the Supabase dashboard, open **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](./supabase/schema.sql) from this repository, copy the whole file, paste it in.
3. Click **Run**.

You should see a long list of `CREATE TABLE`, `CREATE POLICY`, `GRANT`, `CREATE FUNCTION` and finally `CREATE TRIGGER` with no errors.

**This file is idempotent.** Running it twice is safe — every policy is dropped before being recreated, and every table uses `if not exists`.

It creates:

| Object | Purpose |
|---|---|
| `public.profiles` | One row per user, auto-created on signup |
| `public.agents` | Agent definitions, owned by a user |
| `public.documents` | Knowledge base text, owned by a user |
| `public.conversations` | One per chat thread |
| `public.messages` | Turns, with a `citations` JSONB column |
| `public.usage_events` | One row per model call |
| RLS policies | On all six tables |
| `handle_new_user()` trigger | Creates the profile row automatically |

## 3. Copy the API values

In Supabase: **Project Settings → API**.

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable key** (older projects call it **anon public**) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

> Use the **anon / publishable** key. Never put the **service_role** key in any variable that reaches the browser, and never give one a `NEXT_PUBLIC_` prefix.

## 4. Set the environment variables

**Locally:**

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...
```

**On Vercel:** Project → **Settings → Environment Variables**, add both, tick Production / Preview / Development, then **redeploy**. Environment variables set after a deployment do not apply to it.

## 5. Add a model provider (optional but recommended)

Without one, the app runs in demo mode. With one, it gives real answers.

Pick any single provider and add its key:

| Provider | Variable | Where to get a key |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| OpenRouter | `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| Anthropic | `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| Google Gemini | `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey |

Optionally set `AI_PROVIDER` to force a default (`openai`, `openrouter`, `anthropic`, `gemini`). If unset, the first configured provider is used.

The **Settings** page in the app shows which providers it detected.

## 6. Create your first account

Open the deployed site → **Create account**. Supabase sends a confirmation email by default.

- **For quick testing:** Supabase → **Authentication → Providers → Email** → turn off **Confirm email**. Signups then work immediately.
- **For production:** leave confirmation on, and check **Authentication → URL Configuration**:
  - Site URL: your deployed URL
  - Redirect URLs: add `https://your-domain/auth/callback`

## 7. Verify

1. Sign in.
2. **Create agent** → give it a name and instructions.
3. Open it → **Knowledge** tab → paste any text with a fact in it.
4. **Chat** tab → ask about that fact.

You should get a streamed answer with a **“1 source used”** chip. Open it — the passage it matched is shown.

If the answer is the demo stub, step 5 did not take effect. Check the banner says nothing and **Settings** shows the provider as *Configured*.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Setup screen instead of the app | Env vars missing or empty | Set both, redeploy |
| Redirected to `/login` forever | Supabase URL/key wrong | Check **Project Settings → API** |
| `new row violates row-level security policy` | Session not established | Confirm email, or check cookies are not blocked |
| Answers are demo text | No provider key | Add one, redeploy |
| `... is selected but OPENAI_API_KEY is not set` | Agent uses a provider with no key | Add the key, or change the agent's provider |
| Signup says "check your email" but nothing arrives | Supabase default SMTP is rate-limited | Use **Authentication → Users → Add user** manually, or configure SMTP |
| `relation "profiles" does not exist` | Schema not run | Run `supabase/schema.sql` |
| Build fails with a peer dependency error | Older `package.json` | `npm install` — the versions are fixed in this repo |

## Running the tests

```bash
npm test        # 24 unit tests: retrieval, prompt assembly, validation
npm run typecheck
npm run lint
npm run build
```

The tests do not need Supabase or a network connection — they exercise the pure logic only.

## What is not covered by tests

- The auth round-trip and streaming chat have not been run against a live Supabase project in CI. They are typechecked and the SQL is verified against Postgres 15, but your first sign-in is the real integration test.
- Retrieval quality is lexical. There is no embedding model and no evaluation harness.

## Deploying somewhere other than Vercel

The app is a standard Next.js 15 App Router project, so any Node host works (`npm run build && npm start`). You need Node 20+ (22 recommended — `@supabase/supabase-js` warns on 20).

Two things to keep:
- **Middleware** must run — it refreshes the session cookie. Platforms that only serve static files will break auth.
- **The chat route must stream.** If a proxy buffers responses, add `X-Accel-Buffering: no` (already set) and disable compression for `/api/chat`.
