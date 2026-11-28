# Roadmap

What is built, what is next, and what is deliberately not started. Anything
marked **Done** is implemented and tested; anything else is a plan, not a
promise.

## Phase 1 — Foundation

- ~~Next.js app that installs, builds and lints cleanly.~~ **Done.**
- ~~Supabase auth with email/password, session refresh in middleware, protected routes.~~ **Done.**
- ~~Row Level Security on every table, verified by attacking it as two real users.~~ **Done.**
- ~~Honest UI: no dead buttons, no "coming soon" toasts.~~ **Done.**

## Phase 2 — Agents and knowledge

- ~~Create, edit and delete agents with per-agent instructions, model and temperature.~~ **Done.**
- ~~Knowledge base: paste text, or upload a PDF / DOCX and extract its text server-side.~~ **Done.**
- ~~Retrieval with citations: TF-IDF chunk scoring, top 4 passages, numbered in the prompt.~~ **Done.**
- ~~Streaming chat, conversation history persisted, one usage row per model call.~~ **Done.**
- Add chunk embeddings and semantic retrieval, retaining citations to source files and passages.
- Add document replacement, re-indexing and deletion cleanup.
- Store the original uploaded file so it can be re-downloaded, and add OCR for scanned PDFs.

## Phase 3 — Creation studios

- Voice Studio: speech input and text-to-speech with clear consent and provider configuration. **Partially done** — text-to-speech with nine voices, playback and MP3 download works; speech input is not built.
- Avatar Studio: generated avatars and video only through an explicitly selected provider; require consent for real-person likenesses. **Done.** Avatar images run on Gemini or OpenAI; talking video runs on Gemini Omni (OpenAI's video API was shut down in September 2026). Both capabilities are resolved server-side and the panel names the exact variable to add when one is missing. Remaining gap: output is not stored, and video is fixed at 5s/720p.
- Image Studio: prompt-to-image generation with provider/model selection and saved outputs.
- ~~Website Builder: prompt-to-code, isolated preview/build process, editable output and export. Never execute generated code inside the main application server.~~ **Done.** Generation runs through whichever provider is configured; output is sanitised and previewed in a sandboxed iframe; pages can be saved as drafts or published at `/p/<slug>` with a strict CSP; HTML export is supported. Remaining gap: publishing is to a `/p/<slug>` path on this app, not to a custom domain or external host.

## Phase 4 — Product and operations

- Account profile and workspace management
- Plans, quotas and billing only after a payment provider and server-side usage enforcement are implemented
- Admin/support tools, audit logs and abuse controls
- Accessibility, mobile polish, monitoring, backups and recovery documentation
