# 3. A fake for every external service

Status: accepted (2026-11-21)

## Context

The app calls Anthropic, Voyage, Vercel Blob, Resend and Cloudflare Turnstile. Tests that hit them are slow, cost money, are non-deterministic, and need secrets in CI. A visitor cloning the repo should also be able to run it without creating five accounts.

## Decision

Each service sits behind a small interface with a real and a fake implementation, selected by an environment variable that `src/lib/env.ts` validates:

| Service | Variable | Real | Fake |
|---|---|---|---|
| LLM | `AI_PROVIDER` | `anthropic` | `mock` (canned, schema-valid output per prompt purpose) |
| Embeddings | `EMBEDDINGS_PROVIDER` | `voyage` | `fake` (deterministic 1024-dim vectors) |
| File storage | `STORAGE_PROVIDER` | `vercel-blob` | `local` |
| Email | `MAIL_PROVIDER` | `resend` | `console` |
| Bot check | `TURNSTILE_BYPASS` | off (verifies the token) | `true` |

- `.env.example` defaults to all fakes, so `npm run dev` works with no keys.
- A real provider requires its key; env validation fails at first use if it is missing.
- CI, integration tests and e2e tests run with all fakes. Job source adapters are tested against recorded fixtures in `tests/fixtures/jobs`.
- `scripts/generate-demo-template.ts` is the one place real AI output is captured and committed (the demo account's pre-filled CV, matches and letter).

## Consequences

- Tests are fast, free and deterministic, and CI needs no secrets.
- Fakes prove the plumbing, not the quality: prompts and model output are only exercised with real keys.
- Fake embeddings carry no meaning. Vectors written under `fake` (for example by the seed) stay in the database when you switch to Voyage, so re-run ingest or clear the embeddings after switching.
