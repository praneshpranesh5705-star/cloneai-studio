# Audit — 2026-11-26

A fresh clone of this repository was installed, built, run and attacked. This
file records exactly what was checked, what was found, and what was changed.

## How it was checked

| Check | Method | Result |
|---|---|---|
| Installs from a clean clone | `git clone` → `npm install` | ✅ exit 0 |
| Typechecks | `npx tsc --noEmit` | ✅ exit 0, no output |
| Lints | `npx eslint .` | ✅ exit 0, no output |
| Unit tests | `npm test` | ✅ 24/24 pass |
| Production build | `npm run build` | ✅ 21 routes, exit 0 |
| Runs | `npm start` | ✅ ready in 655 ms |
| Routes respond | `curl` every route | ✅ see below |
| Database schema | Ran `schema.sql` on Postgres 15 with Supabase stubs | ✅ clean, idempotent |
| RLS actually isolates users | Two-user attack script | ✅ every attack blocked |
| Secrets in the repo | Pattern scan for keys/tokens | ✅ none |

### Route behaviour with no Supabase configured

Every protected route redirects to `/setup` rather than erroring — the app
degrades instead of breaking, which is what the README claims.

```
307  /                 -> /setup
307  /login            -> /setup
307  /agents           -> /setup
307  /studios/voice    -> /setup
200  /setup            (renders the setup instructions)
200  /icon.svg
200  /robots.txt
200  /sitemap.xml
404  /nonexistent-page (custom not-found page)
```

### RLS attack results

Run as real non-superuser roles against the actual `schema.sql`:

| Attack | Result |
|---|---|
| Bob reads Alice's agents | 0 rows |
| Bob inserts an agent owned by Alice | `new row violates row-level security policy` |
| Bob updates Alice's agent | `UPDATE 0` |
| Bob deletes Alice's agent | `DELETE 0` |
| Bob reads Alice's documents | 0 rows |
| Bob attaches a document to Alice's agent | `INSERT 0 0` |
| Bob reads profiles | 1 row (his own) |
| Bob reads usage events | 0 rows |
| anon reads agents | `permission denied for table agents` |
| Signup trigger creates profile | 2 rows for 2 users ✅ |

## What was found and fixed

### 1. Crash for anyone using the older Supabase key name — fixed

`lib/config.ts` and `middleware.ts` accept `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a
fallback for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. But `lib/supabase/server.ts`
and `lib/supabase/client.ts` read only the publishable name and threw
`Supabase is not configured.` when it was absent.

The result: `isSupabaseConfigured()` returned **true**, so the app skipped the
setup screen and rendered the real UI — then every data call threw. A user who
followed older Supabase documentation got a broken app with no explanation.

Proven with a two-line simulation before the fix:

```
config.isSupabaseConfigured() = true
server.ts would throw      = true
```

Both clients now read through `config.ts`, so the fallback applies everywhere.

### 2. Open redirect after login — fixed

`components/auth-form.tsx` validated the `?next=` parameter with
`next.startsWith("/")`. That also accepts `//evil.com`, which browsers treat as
protocol-relative and navigate off-site. Now rejects `//` as well.

### 3. `supabase/profiles.sql` was a trap — fixed

It was an orphan: not referenced by the README, SETUP.md or any code. Running it
after `schema.sql` created a **second set of three policies** on `profiles`
alongside the existing ones, and running it twice failed outright with
`ERROR: policy "Users can read their own profile" already exists`.

Now it drops both naming schemes (`profiles_select_own` from `schema.sql` and
`"Users can read their own profile"` from this file) before recreating, so the
policy count stays at 3 no matter how many times it runs. Verified on a fresh
database: 3 policies after `schema.sql`, still 3 after two runs of this file.

### 4. Dead footer links — fixed

The footer rendered `Privacy · Terms · Status` as plain text with no links
behind them. Replaced with an accurate statement about where data lives.

### 5. `messageCount` was always 0 — removed

`getDashboardStats()` returned a hardcoded `messageCount: 0` that nothing
displayed. Removed rather than left as a field that lies.

### 6. Missing `robots.txt` and `sitemap.xml` — added

`app/robots.ts` and `app/sitemap.ts`. The app is a private workspace, so
crawlers are allowed only the public entry points and blocked from `/api/`,
`/auth/` and every authenticated page.

### 7. No license — added

MIT, matching the README's "add one before distributing". GitHub now detects it
and shows "MIT license" in the repository sidebar.

### 8. Empty repository metadata — filled in

The repo had no description, no topics and no homepage. Added a description,
12 topics, and the live Vercel URL as the homepage.

## What was verified as already correct

These README claims were checked against the code and hold:

- **24 unit tests** — `grep -c test(` returns 24, and all pass.
- **Top 4 passages** — `retrieve(message, documents, 4)` in `app/api/chat/route.ts`.
- **NDJSON event types** — `meta`, `citations`, `delta`, `done`, `error` all present.
- **User turn persisted before streaming** — the `insert` is awaited before the
  `ReadableStream` is constructed, with a comment saying why.
- **Four providers** — `openai`, `openrouter`, `anthropic`, `gemini` all have
  cases in `lib/providers.ts`.
- **Six tables, 18 policies, RLS on all six** — confirmed in `pg_policies`.
- **`schema.sql` is idempotent** — ran twice, second run produced only NOTICEs.
- **No `service_role` key anywhere** — grep returns nothing.
- **The three studios are honest placeholders** — `app/studios/[slug]/page.tsx`
  renders "Not built yet" and lists what each would require.
- **The live Vercel URL works** — returns 200 and serves the setup screen.

## Known gaps (not bugs, but worth knowing)

- **No `package-lock.json`.** The repo installs with `npm install`, which is what
  the README and SETUP.md say. A lockfile would pin exact versions; it is not
  committed, so a fresh install resolves ranges from `package.json`.
- **`next-env.d.ts` is gitignored.** Next.js regenerates it on every install and
  build, so it does not need to be tracked.

## What is still not verified

- **A live Supabase project.** The schema was run against Postgres 15 with
  stubbed `auth.users` and `auth.uid()`, not against Supabase itself. The auth
  round-trip and the storage layer have never executed against a real project.
- **A real model call.** No provider key was available, so streaming was never
  exercised against OpenAI/Anthropic/Gemini. Demo mode is what was tested.
- **The Vercel deployment's behaviour with credentials.** The live URL serves
  the setup screen correctly, but it has no Supabase project attached.
