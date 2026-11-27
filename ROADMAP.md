# CloneAI Studio — Complete Platform Roadmap

This roadmap extends the existing Next.js, Supabase and multi-provider foundation. Features are only marked complete after implementation and verification; a roadmap item is not a promise that a provider or external service is already connected.

## Current foundation

- Supabase email/password authentication and row-level security
- Agent creation, editing and deletion
- Per-agent provider, model, temperature and token settings
- Knowledge text documents and lexical retrieval
- Streaming chat with citations and saved conversation history
- Usage event logging and a dashboard
- Server-side adapters for Demo, OpenAI, OpenRouter, Anthropic and Google Gemini

## Phase 1 — Reliable multi-provider core

1. Configure Supabase URL and publishable/anon key in Vercel.
2. Configure one or more server-side model API keys.
3. Verify signup, email confirmation, login, logout and data isolation against the real Supabase project.
4. Verify a real streaming request for each configured provider.
5. Make configured providers the default for newly created agents; retain Demo only when no real provider is configured.
6. Add provider-specific error handling, health checks and usage/cost visibility.

## Phase 2 — Knowledge workspace

1. Add secure PDF, DOCX, TXT and Markdown uploads.
2. Store originals in a private Supabase Storage bucket.
3. Extract text server-side, enforce size/type limits and show processing status.
4. Add chunk embeddings and semantic retrieval, retaining citations to source files and passages.
5. Add document replacement, re-indexing and deletion cleanup.

## Phase 3 — Creation studios

- Voice Studio: speech input and text-to-speech with clear consent and provider configuration.
- Avatar Studio: generated avatars and video only through an explicitly selected provider; require consent for real-person likenesses.
- Image Studio: prompt-to-image generation with provider/model selection and saved outputs.
- ~~Website Builder: prompt-to-code, isolated preview/build process, editable output and export. Never execute generated code inside the main application server.~~ **Done.** Generation runs through whichever provider is configured; output is sanitised and previewed in a sandboxed iframe; pages can be saved as drafts or published at `/p/<slug>` with a strict CSP; HTML export is supported. Remaining gap: publishing is to a `/p/<slug>` path on this app, not to a custom domain or external host.

## Phase 4 — Product and operations

- Account profile and workspace management
- Plans, quotas and billing only after a payment provider and server-side usage enforcement are implemented
- Admin/support tools, audit logs and abuse controls
- Accessibility, mobile polish, monitoring, backups and recovery documentation

## Release gates

- No API secrets in client bundles, Git history or database rows.
- Row-level security verified against real Supabase users.
- Build, lint, typecheck and tests pass on the deployment commit.
- Real provider calls tested separately from Demo mode.
- Upload parsing and generated-code previews isolated and size-limited.
- Never label a feature “working” until its end-to-end path is tested.
