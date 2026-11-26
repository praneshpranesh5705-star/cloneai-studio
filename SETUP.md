## 3. Copy the API values

In Supabase: **Project Settings → API**.

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable key** (older projects call it **anon public**) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

> Use the **anon / publishable** key. Never put the **service_role** key in any variable that reaches the browser, and never give one a `NEXT_PUBLIC_` prefix.

> **Older key name also works.** If your project only shows an **anon public** key, you can set `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead — the app accepts either name. Do not set both.

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
