# CloneAI Studio

An all-in-one AI creation workspace for building AI agents, voice experiences, avatars, websites and model integrations.

## Stack

- Next.js App Router
- React + TypeScript
- Custom responsive dark UI
- Supabase (planned for authentication, database and storage)
- Vercel (planned for deployment)

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Authentication setup\n\n1. Create a Supabase project.\n2. In Supabase Project Settings / Connect, copy the Project URL and Publishable key.\n3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Vercel Project Settings → Environment Variables (Production, Preview and Development).\n4. In Supabase Authentication → URL Configuration, set the Site URL to your deployed Vercel URL and add `https://YOUR-VERCEL-DOMAIN/auth/callback` to Redirect URLs.\n5. Run `supabase/profiles.sql` in the Supabase SQL Editor.\n6. Redeploy the Vercel project after adding environment variables.\n\nNever add a service-role or secret key to a `NEXT_PUBLIC_` variable.\n\n## Build roadmap

1. Foundation and dashboard
2. Supabase authentication and profiles
3. AI agent builder and knowledge uploads
4. Consent-based voice studio
5. Avatar studio
6. AI website builder
7. Model provider integrations
8. Subscription, billing and usage metering
9. Admin, security and launch checks

Never commit API keys or service-role secrets. Configure secrets through Vercel Environment Variables.