# CloneAI Studio — Setup

Get the app running locally, then on Vercel. About 15 minutes.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com/dashboard> and sign in.
2. **New project**. Pick the region closest to your users (e.g. Mumbai for India).
3. Wait for provisioning to finish (about two minutes).

## 2. Create the database tables

1. In your project, open **SQL Editor → New query**.
2. Paste the **entire** contents of [`supabase/schema.sql`](./supabase/schema.sql).
3. Press **Run**.

You should see "Success. No rows returned". The script is idempotent — running it again is safe, and it is also how you pick up new tables after an update.

> **Do not run `supabase/profiles.sql`.** It is kept only for older projects that pre-date `schema.sql`. Running it after `schema.sql` is harmless but pointless; `schema.sql` already contains everything it does.

## 3. Copy the API values

In Supabase: **Project Settings → API**.

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable key** (older projects call it **anon public**) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

> Use the **anon / publishable** key. Never put the **service_role** key in any variable that reaches the browser, and never give one a `NEXT_PUBLIC_` prefix.

> **Older key name also works.** If your project only shows an **anon public** key, you can set `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead — the app accepts either name. Do not set both.

## 4. Add a model key

Chat runs in demo mode until you add one. The Website Builder and Voice Studio need a real key to do anything at all.

Get one from any of these, then set it server-side — **no `NEXT_PUBLIC_` prefix**:

| Provider | Variable | Where to get a key |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | <https://platform.openai.com/api-keys> |
| OpenRouter | `OPENROUTER_API_KEY` | <https://openrouter.ai/keys> |
| Anthropic | `ANTHROPIC_API_KEY` | <https://console.anthropic.com/settings/keys> |
| Google Gemini | `GEMINI_API_KEY` | <https://aistudio.google.com/app/apikey> |

The app detects whichever are present. To choose between several, set `AI_PROVIDER` to `openai`, `openrouter`, `anthropic` or `gemini`.

> **OpenAI needs credit.** A new account with no payment method returns `429 insufficient_quota` on every call, which looks like a broken app. Add a payment method under **Settings → Billing** first, and set a hard spend limit under **Limits**.

## 5. Set the environment variables

**Locally:**

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...
OPENAI_API_KEY=sk-...
```

**On Vercel:** Project → **Settings → Environment Variables**, add each one, tick **Production**, **Preview** and **Development**, then **redeploy**. Environment variables set after a deployment do not apply to it.

## 6. Turn off public signups

Supabase Auth → **Sign In / Providers → Email** → disable **Allow new users to sign up** once you have created your own account. Otherwise anyone who finds your project URL can register.

## 7. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Sign up, confirm your email, sign in.

---

## Verify it is working

| Check | Where | Expected |
|---|---|---|
| Supabase connected | any page | No redirect to `/setup` |
| Model configured | `/settings` → Model providers | A green check next to your provider |
| Chat works | `/agents` → open one → send a message | A real reply, no demo banner |
| Knowledge works | `/agents` → Knowledge → paste or upload | Document appears in the list |
| Website Builder works | `/studios/website` → describe a site → **Generate** | A page appears in the preview |
| Publishing works | **Publish** | A `/p/<slug>` link you can open in a private window |

---

## Commands

```bash
npm run dev        # development server
npm run build      # production build
npm start          # serve the production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # unit tests
```

The build fails on lint errors, so run `npm run lint` before pushing.

## Optional: verify the database policies

`tests/sql/` contains the harness used to check row-level security against real Postgres roles. It needs a local Postgres, not Supabase:

```bash
createdb cloneai_test
psql -d cloneai_test -f tests/sql/harness.sql
psql -d cloneai_test -f supabase/schema.sql
psql -d cloneai_test -f tests/sql/websites-rls.sql
```

A clean run prints `ALL WEBSITE RLS CHECKS PASSED`.

---

## Troubleshooting

**Redirected to `/setup`.** One of the two Supabase variables is missing or misspelled. Check both are present in the environment you are actually running.

**"Supabase is not configured."** The variables exist but are empty strings. A blank value counts as missing.

**Chat replies say "Demo mode".** No model key reached the server. Confirm the variable is set in the same environment (Production vs Preview) that you are viewing, and redeploy after adding it.

**Website Builder says it needs a real model.** Same cause. It has no demo fallback by design.

**`/p/<slug>` returns "Page not found".** The page is not published yet, or you have not run the latest `schema.sql` so the `websites` table does not exist.

**A published page looks broken.** Generated pages are served with scripts disabled — if the model used JavaScript for layout or interaction, that part will not run. Ask for a revision that uses CSS only.

**Build fails with `react/no-unescaped-entities`.** A literal apostrophe in JSX text. Use `&apos;` or move the string into an expression.
