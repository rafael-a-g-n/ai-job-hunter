# AI Job Hunter v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 of AI Job Hunter: a deployable Next.js app with real accounts, a per-visitor demo, CV upload and AI analysis, real job ingestion from public APIs, semantic matching, manual job paste, and AI cover letters, all behind usage limits.

**Architecture:** A single Next.js (App Router) TypeScript app. Domain logic lives in plain server-side modules under `src/server/<area>/`, which take a `userId` and never trust the client. UI routes and route handlers are thin wrappers. External services (AI, embeddings, storage, mail, job APIs) sit behind small interfaces, each with a real and a fake implementation chosen by env var, so tests and e2e never hit the network.

**Tech Stack:** Next.js (latest stable) · React · TypeScript strict · Tailwind CSS + shadcn/ui · Prisma + PostgreSQL 16 with pgvector (Neon in prod, Docker locally) · Better Auth · Vercel AI SDK + `@ai-sdk/anthropic` · Voyage AI embeddings · Vercel Blob · Resend · Cloudflare Turnstile · Zod · Vitest · Playwright · GitHub Actions · npm.

**Spec:** `docs/superpowers/specs/2026-11-21-ai-job-hunter-design.md` (Portuguese). Implementers read both documents.

**Scope:** v1 only (spec §7.2). v1.1 (interview simulator, PDF export) and v1.2 (PT/EN UI, multiple CVs UI, GitHub login) get their own plans later. The schema already allows several CVs per user, but the v1 UI handles one active CV.

## Global Constraints

- UI copy is **English only** in v1. AI output language is a per-request option (`en` | `pt`).
- TypeScript `strict: true`; no `any` in `src/server/**`.
- Every server function that reads or writes user data takes `userId: string` and scopes its query by it. Another user's id gives `null` or `NotFoundError`, never the data.
- Secrets come only from `src/lib/env.ts` (Zod-validated `process.env`). `.env*` files are git-ignored except `.env.example`.
- Model IDs: fast = `claude-haiku-5-5`, strong = `claude-sonnet-5-5`. Embeddings: Voyage `voyage-3.5-lite`, **1024 dimensions**.
- CV upload: max **5 MB**; types `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document` only.
- Jobs expire **30 days** after `postedAt` (or `fetchedAt` if missing). Ingest runs every **6 h**; Remotive at most **once per 24 h**.
- Daily limits (UTC day). Regular user: `CV_ANALYSIS` 3, `COVER_LETTER` 10, `MATCH_RERANK` 10, `JOB_NORMALIZE` 10. Demo user: `CV_ANALYSIS` 1, `COVER_LETTER` 2, `MATCH_RERANK` 3, `JOB_NORMALIZE` 2. Global AI budget: `GLOBAL_DAILY_AI_BUDGET_USD` (default `5`).
- Demo users expire **24 h** after creation. Max **3 demo accounts per IP hash per day**.
- Cover letters use only facts present in the CV profile. The prompt must say so, and the output schema carries no invented fields.
- Every external call has a fake: `AI_PROVIDER=mock`, `EMBEDDINGS_PROVIDER=fake`, `STORAGE_PROVIDER=local`, `MAIL_PROVIDER=console`, `TURNSTILE_BYPASS=true`. CI and e2e run with all fakes.
- Commits: one per task, Conventional Commits, author from git config (Rafael Nogueira). End each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before each commit: `npm run lint && npm run typecheck && npm test` pass. Tasks that touch the DB also pass `npm run test:int`.

## Review Focus

1. **Scanned or image-only PDF, or an empty DOCX** (extracted text under 200 chars): the CV ends as `FAILED` with "We couldn't read text from this file. Try a text-based PDF or DOCX." No AI call is made and no usage is consumed. Owned by Task 6.
2. **AI returns schema-invalid output or times out**: one retry, then the operation fails cleanly (CV `FAILED`, letter error toast), and the usage unit is **refunded**. Owned by Tasks 5, 7 and 13.
3. **A job source is down or rate-limited (429/5xx) during ingest**: the other sources still ingest. The run returns a per-source report and the route returns 200 with that report. Owned by Task 9.
4. **Double-click or parallel requests at the limit edge**: the counter never goes past the limit, because the consume step is one atomic SQL statement. Owned by Task 4.
5. **IDOR: requesting another user's CV, letter, match or manual job by id**: 404, with no data leaked. Owned by Tasks 7, 10, 11, 12 and 13 (each adds a cross-user test).

---

## File Structure

```
.github/workflows/ci.yml              lint, typecheck, unit, integration (pgvector service), build, e2e
.github/workflows/ingest.yml          cron 0 */6 * * * → POST $APP_URL/api/cron/ingest
docker-compose.yml                    db (5432) + db-test (5433), image pgvector/pgvector:pg16
prisma/schema.prisma                  all v1 models
prisma/seed.ts                        demo template data
src/lib/env.ts                        Zod env schema → `env`
src/lib/db.ts                         Prisma client singleton `db`
src/lib/errors.ts                     NotFoundError, LimitExceededError, AppError
src/lib/auth.ts / auth-client.ts      Better Auth server/client config
src/server/mail/                      Mailer interface + resend/console impls
src/server/limits/                    usage counters + global budget
src/server/ai/                        provider, models, generateStructured, streamText, cost log, mock fixtures
src/server/embeddings/                Embedder interface + voyage/fake, vector SQL helpers
src/server/storage/                   BlobStore interface + vercel-blob/local
src/server/cv/                        parse, upload, analyze, schemas, prompts
src/server/jobs/sources/              adzuna.ts, arbeitnow.ts, remotive.ts, types.ts
src/server/jobs/                      ingest.ts, search.ts, saved.ts, manual.ts
src/server/matching/                  match.ts, rerank prompt/schema
src/server/letters/                   generate.ts, schemas, prompts, crud
src/server/demo/                      create-demo.ts, cleanup.ts, turnstile.ts
src/server/account/                   delete-account.ts
src/app/(marketing)/page.tsx          landing
src/app/(auth)/...                    sign-in, sign-up, verify, forgot/reset password
src/app/(app)/...                     dashboard, cv, jobs, jobs/[id], letters, settings
src/app/api/...                       auth/[...all], cron/ingest, letters/stream, demo
tests/unit/** , tests/int/** , e2e/** , tests/fixtures/**
docs/adr/                             0001-nextjs-monolith.md, 0002-ingest-not-live-search.md, 0003-fakes-for-external-services.md
```

---

### Task 1: Project scaffold, tooling and CI

**Files:**
- Create: Next.js app at repo root (`package.json`, `src/app/**`, `tsconfig.json`, Tailwind config), `components.json` (shadcn), `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, `.env.example`, `.prettierrc`, `tests/unit/smoke.test.ts`, `e2e/smoke.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces npm scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (vitest unit, `tests/unit`), `test:int` (vitest `tests/int`, `--config vitest.int.config.ts`), `test:e2e` (playwright), `format`.
- Path alias `@/*` → `src/*`.

- [ ] **Step 1:** Run `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` in the repo root (keep the existing `docs/`, `CLAUDE.md` and `.scratch/`). Init shadcn/ui (`npx shadcn@latest init`) and add `button card input label textarea badge dialog dropdown-menu sonner skeleton tabs select progress`.
- [ ] **Step 2:** Write `tests/unit/smoke.test.ts` asserting `1 + 1 === 2`, and `e2e/smoke.spec.ts` asserting that GET `/` returns 200 and the page has a `<main>`.
- [ ] **Step 3:** Add Vitest (`environment: node`, include `tests/unit/**/*.test.ts`) and Playwright (`webServer: npm run build && npm start`, port 3000, chromium only).
- [ ] **Step 4:** Run `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`. Expected: all green.
- [ ] **Step 5:** Write `ci.yml`: Node 24 LTS, `npm ci`, lint, typecheck, test, build. Integration and e2e jobs are added in Task 2 and Task 18.
- [ ] **Step 6:** Commit `chore: scaffold Next.js app with tooling and CI`.

### Task 2: Database, env and error primitives

**Files:**
- Create: `docker-compose.yml`, `prisma/schema.prisma`, first migration, `src/lib/env.ts`, `src/lib/db.ts`, `src/lib/errors.ts`, `vitest.int.config.ts`, `tests/int/setup.ts`, `tests/int/db.test.ts`, `tests/unit/env.test.ts`
- Modify: `.env.example`, `ci.yml` (int job with a `pgvector/pgvector:pg16` service)

**Interfaces:**
- Produces `env` (typed). Keys: `DATABASE_URL, APP_URL, BETTER_AUTH_SECRET, AI_PROVIDER ('anthropic'|'mock'), ANTHROPIC_API_KEY?, EMBEDDINGS_PROVIDER ('voyage'|'fake'), VOYAGE_API_KEY?, STORAGE_PROVIDER ('vercel-blob'|'local'), BLOB_READ_WRITE_TOKEN?, MAIL_PROVIDER ('resend'|'console'), RESEND_API_KEY?, EMAIL_FROM, ADZUNA_APP_ID?, ADZUNA_APP_KEY?, CRON_SECRET, TURNSTILE_SECRET_KEY?, NEXT_PUBLIC_TURNSTILE_SITE_KEY?, TURNSTILE_BYPASS (bool, default false), GLOBAL_DAILY_AI_BUDGET_USD (number, default 5)`. A refine requires the real-provider key whenever that provider is selected.
- Produces `db: PrismaClient`; `class NotFoundError`, `class LimitExceededError { action; limit }`, `class AppError { code; userMessage }`.
- Produces Prisma models (Better Auth tables come from `npx @better-auth/cli generate`, then extended):
  - `User` (Better Auth) + `isDemo Boolean @default(false)`, `demoExpiresAt DateTime?`
  - `Session`, `Account`, `Verification` (Better Auth)
  - `Cv { id, userId, fileName, blobKey, mimeType, sizeBytes, rawText String?, status CvStatus(UPLOADED|ANALYZING|ANALYZED|FAILED), failureReason String?, isActive Boolean, profile Json?, analysis Json?, embedding Unsupported("vector(1024)")?, createdAt, updatedAt }`
  - `Job { id, source JobSource(ADZUNA|ARBEITNOW|REMOTIVE|MANUAL), externalId String?, dedupeHash String @unique, title, company, location String?, remote Boolean, description String, url String?, salaryMin Int?, salaryMax Int?, currency String?, postedAt DateTime?, fetchedAt DateTime, expiresAt DateTime, ownerId String?, embedding Unsupported("vector(1024)")? }`, indexes on `(expiresAt)` and `(ownerId)`, plus an HNSW index on `embedding vector_cosine_ops` in raw migration SQL
  - `SavedJob { userId, jobId, createdAt } @@id([userId, jobId])`
  - `MatchResult { id, cvId, jobId, vectorScore Float, score Int?, matchedSkills String[], gaps String[], explanation String?, createdAt } @@unique([cvId, jobId])`
  - `CoverLetter { id, userId, cvId, jobId, tone Tone(FORMAL|NEUTRAL|ENTHUSIASTIC), language String, length LetterLength(SHORT|MEDIUM|LONG), content String, createdAt, updatedAt }`
  - `UsageCounter { userId, action UsageAction(CV_ANALYSIS|COVER_LETTER|MATCH_RERANK|JOB_NORMALIZE), day DateTime @db.Date, count Int } @@id([userId, action, day])`
  - `AiCall { id, userId String?, purpose String, model String, inputTokens Int, outputTokens Int, costUsd Decimal(10,6), durationMs Int, ok Boolean, createdAt }`
  - `DemoSignup { ipHash, day DateTime @db.Date, count Int } @@id([ipHash, day])`
  - `IngestRun { id, source JobSource, startedAt, finishedAt, fetched Int, inserted Int, error String? }`
  - All user-owned relations `onDelete: Cascade`.

- [ ] **Step 1:** Write `tests/unit/env.test.ts`: `parseEnv({...valid, AI_PROVIDER:'anthropic'})` without `ANTHROPIC_API_KEY` throws; with `AI_PROVIDER:'mock'` it passes; `GLOBAL_DAILY_AI_BUDGET_USD` defaults to `5`. Export `parseEnv(raw)` for testing.
- [ ] **Step 2:** Run `npm test -- env`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `env.ts`, `db.ts` and `errors.ts`; write the schema; add `CREATE EXTENSION IF NOT EXISTS vector` and the HNSW index to the migration SQL; run `npx prisma migrate dev --name init`.
- [ ] **Step 4:** Write `tests/int/db.test.ts`: create a user and a Cv, delete the user, and assert the Cv is gone (cascade). Insert a `Job` embedding with `$executeRaw` and read it back with `embedding <=> $1::vector`. `tests/int/setup.ts` runs `prisma migrate reset --force --skip-seed` against `db-test` (port 5433) once, and truncates all tables between files.
- [ ] **Step 5:** Run `docker compose up -d db-test && npm test && npm run test:int`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(db): add Prisma schema with pgvector, env validation and errors`.

### Task 3: Authentication (Better Auth) with email verification and password reset

> Deviation from spec §5 ("Auth.js v5"), my call: since late 2025 Auth.js has been maintained by the Better Auth team, who recommend Better Auth for new projects. It ships email verification, password reset, rate limiting, a Prisma adapter and GitHub OAuth (v1.2) out of the box. Record this in `docs/adr/0004-better-auth.md`.

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`, `src/server/mail/{mailer.ts,resend.ts,console.ts,templates.ts}`, `src/server/auth/session.ts`, `middleware.ts`, `src/app/(auth)/{sign-in,sign-up,verify-email,forgot-password,reset-password}/page.tsx`, `tests/int/auth.test.ts`, `tests/unit/mail.test.ts`, `docs/adr/0004-better-auth.md`

**Interfaces:**
- Produces `getMailer(): Mailer` with `Mailer { send(msg: { to: string; subject: string; html: string; text: string }): Promise<void> }`. The console impl logs and keeps `sentMessages` (exported, for tests/e2e).
- Produces `requireUser(): Promise<{ id: string; email: string; isDemo: boolean }>` (server components/actions; redirects to `/sign-in` without a session) and `getOptionalUser()`.
- Middleware: `/dashboard`, `/cv`, `/jobs`, `/letters`, `/settings` require a session cookie; unauthenticated → `/sign-in?next=…`.
- Better Auth config: `emailAndPassword { enabled, requireEmailVerification: true, minPasswordLength: 8, sendResetPassword }`, `emailVerification { sendOnSignUp: true, autoSignInAfterVerification: true, sendVerificationEmail }`, `user.additionalFields { isDemo, demoExpiresAt }` (input: false), built-in rate limit enabled.

- [ ] **Step 1:** Write `tests/unit/mail.test.ts`: the console mailer records a message; `verificationEmail(url)` and `resetPasswordEmail(url)` templates include the URL in both html and text.
- [ ] **Step 2:** Write `tests/int/auth.test.ts` using `auth.api` directly: sign-up stores the user with `emailVerified=false` and sends one verification mail; sign-in before verification is rejected; after hitting the verification URL token, sign-in succeeds; a duplicate email is rejected; the reset flow changes the password (the old one fails, the new one works); a 7-char password is rejected.
- [ ] **Step 3:** Run them. Expected: FAIL.
- [ ] **Step 4:** Implement the config, mailers, route, middleware and session helpers. Build the auth pages with shadcn forms (client-side Zod validation, server errors shown inline).
- [ ] **Step 5:** Run `npm test && npm run test:int`. Expected: PASS. Then manually: `npm run dev`, sign up, copy the verification link from the console, verify, land on `/dashboard` (a placeholder page is fine).
- [ ] **Step 6:** Commit `feat(auth): email/password auth with verification and reset via Better Auth`.

### Task 4: Usage limits and global AI budget

**Files:**
- Create: `src/server/limits/{config.ts,usage.ts}`, `tests/int/limits.test.ts`

**Interfaces:**
- Produces `LIMITS: Record<'user'|'demo', Record<UsageAction, number>>` with the values from Global Constraints.
- Produces `consumeUsage(userId: string, action: UsageAction, isDemo: boolean): Promise<{ remaining: number }>`, which throws `LimitExceededError`. One atomic statement: `INSERT … ON CONFLICT (userId, action, day) DO UPDATE SET count = count + 1 WHERE UsageCounter.count < $limit RETURNING count`; no row returned → throw.
- Produces `refundUsage(userId, action): Promise<void>` (decrements today's count, floor 0).
- Produces `getUsageSummary(userId, isDemo): Promise<Record<UsageAction, { used: number; limit: number }>>`.
- Produces `assertGlobalBudget(): Promise<void>`: sums today's `AiCall.costUsd`; if `>= env.GLOBAL_DAILY_AI_BUDGET_USD`, throws `AppError('BUDGET_EXHAUSTED', 'The demo has reached today's AI budget. Please try again tomorrow.')`.

- [ ] **Step 1:** Write tests: three `CV_ANALYSIS` consumes for a regular user succeed and the 4th throws `LimitExceededError`; a demo user's 2nd throws; **20 parallel `consumeUsage` calls with limit 3 give exactly 3 successes** (Review Focus 4); `refundUsage` after a success lets one more through; a new UTC day resets (insert a counter dated yesterday); `assertGlobalBudget` throws once seeded AiCall costs reach 5.
- [ ] **Step 2:** Run `npm run test:int -- limits`. Expected: FAIL.
- [ ] **Step 3:** Implement with `db.$queryRaw`.
- [ ] **Step 4:** Run again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(limits): atomic per-user daily usage limits and global AI budget`.

### Task 5: AI layer and embeddings

**Files:**
- Create: `src/server/ai/{models.ts,provider.ts,structured.ts,stream.ts,cost.ts,mock.ts}`, `src/server/embeddings/{embedder.ts,voyage.ts,fake.ts,vector.ts}`, `tests/unit/ai-structured.test.ts`, `tests/unit/embeddings.test.ts`, `tests/int/ai-cost.test.ts`

**Interfaces:**
- Produces `MODELS = { fast: 'claude-haiku-5-5', strong: 'claude-sonnet-5-5' } as const` and a per-million-token price table `PRICES[model] = { input, output }` (look up the current Anthropic prices; put them in one place).
- Produces `generateStructured<T>(opts: { purpose: string; userId?: string; model: keyof typeof MODELS; schema: ZodType<T>; system: string; prompt: string; mockKey: string; timeoutMs?: number /* default 60000 */ }): Promise<T>`. Uses AI SDK `generateObject`. On a schema validation error or timeout it retries **once**, then throws `AppError('AI_FAILED', 'The AI service failed. Please try again.')`. It logs every attempt to `AiCall` (`ok` true/false) via `recordAiCall` and calls `assertGlobalBudget()` first.
- Produces `streamAiText(opts: { purpose; userId?; model; system; prompt; mockKey }): StreamTextResult` (AI SDK `streamText`; usage recorded in `onFinish`).
- Mock provider (`AI_PROVIDER=mock`): returns `MOCK_FIXTURES[mockKey]`, a typed record of deterministic outputs added by later tasks (`cv.analysis`, `jobs.normalize`, `matching.rerank`, `letters.generate`). Implement it with the AI SDK's `MockLanguageModelV2` (or the current equivalent) so the same code path is exercised.
- Produces `getEmbedder(): Embedder` with `Embedder { embed(texts: string[], kind: 'document'|'query'): Promise<number[][]> }`. Voyage: model `voyage-3.5-lite`, `output_dimension: 1024`, batches of up to 128. Fake: deterministic 1024-d unit vectors from a hash of token counts, so texts with similar words land closer together (for meaningful tests).
- Produces `toPgVector(v: number[]): string` (`'[0.1,0.2,…]'`) and `assertDims(v)` (throws if not 1024).

- [ ] **Step 1:** Write `ai-structured.test.ts` with an injected fake model: valid JSON → parsed object; invalid then valid → returns on retry (2 calls); invalid twice → throws `AppError` code `AI_FAILED`; a timeout behaves the same. Write `embeddings.test.ts`: the fake gives 1024 dims and unit norm; "react typescript frontend" is closer to "frontend developer react" than to "warehouse forklift driver"; `toPgVector` formats correctly.
- [ ] **Step 2:** Write `ai-cost.test.ts`: a successful call writes `AiCall` with tokens and a cost computed from `PRICES`; a failed attempt writes `ok=false`.
- [ ] **Step 3:** Run all three. Expected: FAIL.
- [ ] **Step 4:** Implement. Inject the model via an optional `deps` parameter for tests; default to the env-selected provider.
- [ ] **Step 5:** Run `npm test && npm run test:int`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(ai): provider-agnostic structured generation, streaming, cost log and embeddings`.

### Task 6: Storage and CV upload with text extraction

**Files:**
- Create: `src/server/storage/{blob-store.ts,vercel-blob.ts,local.ts}`, `src/server/cv/{parse.ts,upload.ts}`, `tests/fixtures/cv/{sample.pdf,sample.docx,scanned.pdf,empty.docx}`, `tests/unit/cv-parse.test.ts`, `tests/int/cv-upload.test.ts`

**Interfaces:**
- Produces `getBlobStore(): BlobStore` with `{ put(key: string, data: Buffer, contentType: string): Promise<void>; get(key): Promise<Buffer>; delete(key): Promise<void> }`. Local writes to `.data/blobs/` (git-ignored). Vercel Blob uses `access: 'private'` where supported; otherwise random unguessable keys, and files are only ever served through our server.
- Produces `extractText(buf: Buffer, mimeType: string): Promise<string>` (`unpdf` for PDF, `mammoth.extractRawText` for DOCX; whitespace normalised).
- Produces `uploadCv(userId: string, file: { name: string; type: string; size: number; data: Buffer }): Promise<Cv>`. It validates type and size (`AppError('INVALID_FILE', …)`), stores the blob at `cv/{userId}/{cuid}`, extracts the text, and sets the new CV `isActive=true` (others false). If the text is shorter than 200 chars: `status=FAILED`, `failureReason="We couldn't read text from this file. Try a text-based PDF or DOCX."`; otherwise `status=UPLOADED`.

- [ ] **Step 1:** Make the fixtures. `sample.pdf` and `sample.docx` hold the same fictional CV, "Ana Silva, Frontend Developer, Lisbon, React/TypeScript, 4 years". `scanned.pdf` is image-only. Use a short script in `tests/fixtures/make-fixtures.ts` and commit both the script and its outputs.
- [ ] **Step 2:** Write `cv-parse.test.ts`: the PDF and DOCX both contain "Ana Silva" and "TypeScript"; `scanned.pdf` gives a string of length < 200.
- [ ] **Step 3:** Write `cv-upload.test.ts` (local store): a valid PDF → `UPLOADED`, active, blob readable; a 6 MB buffer → `INVALID_FILE`; `image/png` → `INVALID_FILE`; `scanned.pdf` → `FAILED` with the exact `failureReason` (Review Focus 1); a second upload makes the first inactive.
- [ ] **Step 4:** Run. Expected: FAIL. Implement. Run `npm test && npm run test:int`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(cv): CV upload with storage abstraction and PDF/DOCX text extraction`.

### Task 7: CV analysis service and CV pages

**Files:**
- Create: `src/server/cv/{schemas.ts,prompts.ts,analyze.ts,queries.ts}`, `src/app/(app)/cv/page.tsx`, `src/app/(app)/cv/[id]/page.tsx`, `src/app/(app)/cv/actions.ts`, `src/components/cv/*`, `tests/unit/cv-schemas.test.ts`, `tests/int/cv-analyze.test.ts`
- Modify: `src/server/ai/mock.ts` (add `cv.analysis`)

**Interfaces:**
- Produces Zod `CvProfile = { fullName, headline, seniority: 'intern'|'junior'|'mid'|'senior'|'lead', yearsExperience: number, location: string|null, languages: {name, level}[], skills: { name, category: 'technical'|'soft'|'tool'|'language', level: 1|2|3|4|5 }[], experience: { title, company, start, end: string|null, highlights: string[] }[], education: { degree, institution, year: string|null }[], preferences: { remote: boolean|null, roles: string[] } }`.
- Produces Zod `CvAnalysis = { overallScore: 0..100, sections: { clarity, impact, atsCompatibility, skills }: each { score: 0..100, comment: string }, strengths: string[] (1-5), improvements: { title, detail, example: string|null }[] (1-8) }`.
- Produces `analyzeCv(userId: string, cvId: string, language: 'en'|'pt'): Promise<Cv>`. It loads the CV scoped by userId (`NotFoundError` otherwise), then `consumeUsage(CV_ANALYSIS)` → status `ANALYZING` → one `generateStructured` call (model `fast`, schema `{ profile: CvProfile, analysis: CvAnalysis }`, mockKey `cv.analysis`) → embeds `profileToText(profile)` as a `document` → saves profile, analysis, embedding, status `ANALYZED`. On `AppError` it sets `FAILED`, sets `failureReason` from `userMessage` and calls `refundUsage` (Review Focus 2). It rejects with `AppError('CV_NOT_READY')` when the CV status is `FAILED` or `ANALYZING`.
- Produces `profileToText(p: CvProfile): string` (headline + seniority + skills + experience titles/highlights). Matching reuses it.
- Produces `updateCvProfile(userId, cvId, profile: CvProfile): Promise<Cv>` (re-validates and re-embeds; no AI call, no usage).
- Produces `getCv(userId, cvId)`, `getActiveCv(userId)`, `listCvs(userId)`.
- UI: `/cv` has a drag-and-drop upload (client posts `FormData` to the `uploadCvAction` server action), then the action triggers analysis, and the page shows a progress state. `/cv/[id]` shows the score ring, section bars, strengths, improvements, and the editable profile (skills chips, experience list) with Save.

- [ ] **Step 1:** Write `cv-schemas.test.ts`: the `cv.analysis` mock fixture parses; `overallScore: 120` fails; `profileToText` includes the skills and headline.
- [ ] **Step 2:** Write `cv-analyze.test.ts` (mock AI, fake embedder): an analysed CV has status `ANALYZED`, a profile, and an embedding that is not null; usage is now 1. With an injected failing model, status is `FAILED` and usage is back to 0. User B calling `analyzeCv` on user A's CV → `NotFoundError` (Review Focus 5). The 4th analysis in a day → `LimitExceededError`. `updateCvProfile` changes the embedding and leaves usage unchanged.
- [ ] **Step 3:** Run. Expected: FAIL. Implement the service. Run. Expected: PASS.
- [ ] **Step 4:** Build the pages. Show `LimitExceededError` as "You've used today's N analyses. Limits reset at 00:00 UTC." Manual check with `AI_PROVIDER=mock`: upload `sample.pdf`, see the report, edit a skill, save.
- [ ] **Step 5:** Commit `feat(cv): AI CV analysis with structured profile, report and editable profile`.

### Task 8: Job source adapters

**Files:**
- Create: `src/server/jobs/sources/{types.ts,adzuna.ts,arbeitnow.ts,remotive.ts,index.ts}`, `src/server/jobs/sources/config.ts`, `tests/fixtures/jobs/{adzuna.json,arbeitnow.json,remotive.json}`, `tests/unit/job-sources.test.ts`

**Interfaces:**
- Produces `NormalizedJob = { source: JobSource; externalId: string; title; company; location: string|null; remote: boolean; description: string /* plain text, HTML stripped */; url: string; salaryMin: number|null; salaryMax: number|null; currency: string|null; postedAt: Date|null }`.
- Produces `interface JobSourceAdapter { source: JobSource; minIntervalHours: number; fetchJobs(fetchFn?: typeof fetch): Promise<NormalizedJob[]> }`.
- Produces `SOURCES_CONFIG = { adzuna: { countries: ['pt'], queries: ['developer','engineer','designer','data','marketing','sales','customer'], resultsPerPage: 50, pages: 2 }, arbeitnow: { pages: 3 }, remotive: { limit: 300 } }`. Adzuna `minIntervalHours: 6`, Arbeitnow `6`, Remotive `24`. Adzuna endpoint: `https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?app_id&app_key&what&results_per_page`. Arbeitnow: `https://www.arbeitnow.com/api/job-board-api?page=N`. Remotive: `https://remotive.com/api/remote-jobs?limit=N`. **Check each provider's current docs** and save one real response shape as the fixture.
- Produces `getEnabledAdapters(): JobSourceAdapter[]` (Adzuna only when its keys are set).
- Produces `computeDedupeHash(j: Pick<NormalizedJob,'title'|'company'|'location'>): string`: sha256 of the lower-cased, whitespace-collapsed `title|company|location`.

- [ ] **Step 1:** Write tests with the fixture JSON and a stubbed `fetchFn`: each adapter maps fields correctly (spot-check title, company, remote, url, postedAt); HTML in descriptions is stripped; Adzuna builds the right URLs for each query and page; `computeDedupeHash("Senior  Dev","ACME","Lisbon") === computeDedupeHash("senior dev","acme","lisbon")`; a non-2xx response makes `fetchJobs` throw an error carrying the status.
- [ ] **Step 2:** Run. Expected: FAIL. Implement. Run. Expected: PASS.
- [ ] **Step 3:** Commit `feat(jobs): Adzuna, Arbeitnow and Remotive source adapters`.

### Task 9: Ingestion pipeline, cron route and scheduled workflow

**Files:**
- Create: `src/server/jobs/ingest.ts`, `src/app/api/cron/ingest/route.ts`, `.github/workflows/ingest.yml`, `tests/int/ingest.test.ts`, `docs/adr/0002-ingest-not-live-search.md`

**Interfaces:**
- Produces `runIngest(opts?: { adapters?: JobSourceAdapter[]; now?: Date; force?: boolean }): Promise<IngestReport>` where `IngestReport = { sources: { source: JobSource; skipped?: 'interval'; fetched: number; inserted: number; error?: string }[]; expired: number; demoUsersDeleted: number }`. Steps: for each adapter, skip it if its last successful `IngestRun` is newer than `minIntervalHours` (unless `force`); fetch; upsert by `dedupeHash` (insert new; on existing, refresh `fetchedAt`/`expiresAt`); embed new jobs in batches (`kind: 'document'`, text = title + company + location + first 2000 chars of description); write `IngestRun`. **One adapter throwing does not stop the others** (Review Focus 3). Then delete non-manual jobs whose `expiresAt < now` (set `expiresAt = (postedAt ?? fetchedAt) + 30d`), then call `cleanupExpiredDemoUsers(now)` from Task 15. Until Task 15 lands, use a stub in `src/server/demo/cleanup.ts` that returns 0.
- Route `POST /api/cron/ingest`: requires `Authorization: Bearer ${CRON_SECRET}` (else 401), sets `maxDuration = 60`, returns the `IngestReport` JSON with status 200.
- `ingest.yml`: `on: schedule: cron '0 */6 * * *'` + `workflow_dispatch`; `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/ingest"`, with the secrets `APP_URL` and `CRON_SECRET`.

- [ ] **Step 1:** Write tests with fake adapters: first run inserts N jobs with embeddings; a second run with the same data inserts 0 and refreshes `fetchedAt`; adapter A throws and adapter B still inserts, and the report has an error for A (Review Focus 3); Remotive is skipped within 24 h unless `force`; a job posted 31 days ago is deleted and a manual job never is; the route returns 401 without the secret and 200 with it.
- [ ] **Step 2:** Run. Expected: FAIL. Implement. Run. Expected: PASS.
- [ ] **Step 3:** Commit `feat(jobs): scheduled ingestion with dedupe, expiry, embeddings and cron endpoint`.

### Task 10: Job search, job detail and saved jobs

**Files:**
- Create: `src/server/jobs/{search.ts,saved.ts}`, `src/app/(app)/jobs/page.tsx`, `src/app/(app)/jobs/[id]/page.tsx`, `src/app/(app)/jobs/actions.ts`, `src/components/jobs/*`, `tests/int/job-search.test.ts`

**Interfaces:**
- Produces `searchJobs(userId: string, q: { text?: string; location?: string; remote?: boolean; source?: JobSource; page?: number /* 1-based */; pageSize?: number /* default 20, max 50 */ }): Promise<{ items: JobListItem[]; total: number; page: number; pageSize: number }>`. It includes public jobs plus the user's own manual jobs (`ownerId = userId`), never other users' manual jobs. Text matches title, company or description (ILIKE; Postgres full text is optional). Sort: `postedAt desc nulls last`.
- Produces `getJob(userId, jobId): Promise<Job>` (a public job, or the user's manual job; else `NotFoundError`).
- Produces `toggleSavedJob(userId, jobId): Promise<{ saved: boolean }>` and `listSavedJobs(userId)`.
- UI: `/jobs` has search filters in the URL (`?q=&location=&remote=1&source=&page=`), cards (title, company, location, remote badge, source, posted-ago, save toggle) and pagination. `/jobs/[id]` shows the full description, a link to the original, save, and slots for the match panel (Task 12) and "Write cover letter" (Task 13).

- [ ] **Step 1:** Write tests: the text filter finds "React" in a description; the remote filter works; pagination totals are right; user B's search never returns user A's manual job; `getJob` on A's manual job as B → `NotFoundError` (Review Focus 5); the save toggle flips.
- [ ] **Step 2:** Run. Expected: FAIL. Implement. Run. Expected: PASS. Build the pages; manual check with seeded jobs.
- [ ] **Step 3:** Commit `feat(jobs): job search, detail and saved jobs`.

### Task 11: Manual job paste

**Files:**
- Create: `src/server/jobs/manual.ts`, `src/server/jobs/manual-schema.ts`, `src/app/(app)/jobs/new/page.tsx`, `tests/int/manual-job.test.ts`
- Modify: `src/server/ai/mock.ts` (add `jobs.normalize`)

**Interfaces:**
- Produces `createManualJob(userId: string, isDemo: boolean, input: { text: string /* 50..20000 chars */; url?: string }): Promise<Job>`. It runs `consumeUsage(JOB_NORMALIZE)`, then `generateStructured` (fast, mockKey `jobs.normalize`, schema `{ title, company: string|null, location: string|null, remote: boolean, description: string }`), then saves `source=MANUAL, ownerId=userId, company ?? 'Unknown company', dedupeHash = computeDedupeHash(...) + ':' + userId, expiresAt = now + 365d` and embeds it. It refunds usage on AI failure.
- Produces `deleteManualJob(userId, jobId)`.

- [ ] **Step 1:** Write tests: valid text → job with `ownerId` and an embedding; text under 50 chars → `AppError('INVALID_INPUT')` with no usage consumed; AI failure → refund; user B cannot delete user A's job (`NotFoundError`).
- [ ] **Step 2:** Run. Expected: FAIL. Implement. Run. Expected: PASS. Build the page (textarea + optional URL → redirects to `/jobs/[id]`).
- [ ] **Step 3:** Commit `feat(jobs): paste a job description and normalise it with AI`.

### Task 12: Matching (vector recall + AI re-rank) and match UI

**Files:**
- Create: `src/server/matching/{match.ts,schemas.ts,prompts.ts}`, `src/app/(app)/jobs/matches/page.tsx`, `src/components/matching/*`, `tests/int/matching.test.ts`
- Modify: `src/server/ai/mock.ts` (add `matching.rerank`), `src/app/(app)/jobs/[id]/page.tsx` (match panel)

**Interfaces:**
- Produces `findMatches(userId: string, isDemo: boolean, opts?: { cvId?: string; filters?: { remote?: boolean; location?: string } }): Promise<MatchView[]>`, where `MatchView = { job: JobListItem; vectorScore: number; score: number|null; matchedSkills: string[]; gaps: string[]; explanation: string|null }`.
  1. Load the active (or given) CV scoped by userId; if it isn't `ANALYZED`, throw `AppError('CV_NOT_READY', 'Analyze your CV first.')`.
  2. Recall: raw SQL `SELECT id, 1 - (embedding <=> $cv) AS sim FROM "Job" WHERE expiresAt > now() AND (ownerId IS NULL OR ownerId = $user) [AND filters] ORDER BY embedding <=> $cv LIMIT 50`.
  3. Re-rank: take the top 10 without a cached `MatchResult.score` for this CV. If there are any: `consumeUsage(MATCH_RERANK)` (one unit per re-rank batch), one `generateStructured` call (fast, mockKey `matching.rerank`, schema `{ results: { jobId, score: 0..100, matchedSkills: string[], gaps: string[], explanation: string }[] }`, input = `profileToText` + each job's title/company/first 1500 chars). Ignore result `jobId`s that weren't sent. Upsert `MatchResult`. On AI failure, refund and still return the vector-only results.
  4. Return: the re-ranked ones first, sorted by `score` desc, then the rest by `vectorScore`.
- Produces `getMatchForJob(userId, jobId): Promise<MatchView|null>` (cached only; no AI call).
- UI: `/jobs/matches` lists the matches with a score badge (colour bands ≥75 / 50–74 / <50), matched skills (green chips), gaps (amber chips), explanation, and an empty state when there is no analysed CV (CTA → `/cv`). The job detail page shows the cached match panel.

- [ ] **Step 1:** Write tests (fake embedder, mock AI). Seed 15 jobs (5 React frontend, 10 unrelated) and an analysed frontend CV: the top 5 by `vectorScore` are all the frontend jobs; re-ranked results carry the fixture scores; a second call makes **no** AI call (count `AiCall` rows) and consumes no usage; a mock result with an unknown `jobId` is ignored; AI failure → vector-only results and usage refunded; another user's manual jobs never appear; a CV that isn't analysed → `CV_NOT_READY`.
- [ ] **Step 2:** Run. Expected: FAIL. Implement. Run. Expected: PASS. Build the UI.
- [ ] **Step 3:** Commit `feat(matching): semantic job matching with AI re-ranking and cached results`.

### Task 13: Cover letters (streaming generation, editor, history)

**Files:**
- Create: `src/server/letters/{prompts.ts,generate.ts,crud.ts}`, `src/app/api/letters/stream/route.ts`, `src/app/(app)/letters/page.tsx`, `src/app/(app)/letters/[id]/page.tsx`, `src/components/letters/*`, `tests/unit/letter-prompt.test.ts`, `tests/int/letters.test.ts`
- Modify: `src/server/ai/mock.ts` (add `letters.generate`, a plain-text letter), `src/app/(app)/jobs/[id]/page.tsx` ("Write cover letter" button)

**Interfaces:**
- Produces `buildLetterPrompt(profile: CvProfile, job: Job, opts: { tone: Tone; language: 'en'|'pt'; length: LetterLength }): { system: string; prompt: string }`. The system prompt must include the rule: *"Use only facts present in the candidate profile. Never invent employers, titles, dates, numbers, degrees or skills. If the job asks for something the candidate lacks, do not claim it."* Length targets: SHORT ~150 words, MEDIUM ~250, LONG ~350. PT means European Portuguese.
- Route `POST /api/letters/stream` with body `{ jobId, tone, language, length }`: `requireUser` → load the active analysed CV and the job (scoped) → `consumeUsage(COVER_LETTER)` → `streamAiText` (model `strong`, mockKey `letters.generate`). In `onFinish` it creates the `CoverLetter` row and sends its id in a response header or final data part. On a stream error it refunds usage. Error JSON statuses: 401, 404, 409 `CV_NOT_READY`, 429 `LIMIT_EXCEEDED` (with `{limit}`), 503 `BUDGET_EXHAUSTED`.
- Produces `listLetters(userId)`, `getLetter(userId, id)`, `updateLetter(userId, id, content: string /* max 10000 */)`, `deleteLetter(userId, id)`.
- UI: a dialog on the job page (tone / language / length selects → streams text live via AI SDK `useCompletion`, or the current equivalent) → saved → `/letters/[id]` with a textarea editor (autosave debounced 1 s), Copy, Regenerate (new letter, same options), Delete. `/letters` lists them with job title and company.

- [ ] **Step 1:** Write `letter-prompt.test.ts`: the system prompt contains the "Use only facts" rule; PT selects European Portuguese wording in the instructions; the prompt contains the job title and the profile skills; the length target is reflected.
- [ ] **Step 2:** Write `letters.test.ts` (call the route handler with a mocked session): a streamed response saves a `CoverLetter` with the mock content and consumes 1 usage; without an analysed CV → 409; at the limit → 429; another user's job (manual) → 404; `getLetter` across users → `NotFoundError` (Review Focus 5); `updateLetter` with 10001 chars → `INVALID_INPUT`.
- [ ] **Step 3:** Run. Expected: FAIL. Implement. Run. Expected: PASS. Build the UI; manual check with the mock.
- [ ] **Step 4:** Commit `feat(letters): streaming AI cover letters with editor and history`.

### Task 14: Demo template seed (real pre-generated AI output)

**Files:**
- Create: `prisma/seed.ts`, `src/server/demo/template.ts`, `scripts/generate-demo-template.ts`, `src/server/demo/template-data.json`, `tests/int/seed.test.ts`

**Interfaces:**
- Produces `DemoTemplate = { cv: { fileName; rawText; profile: CvProfile; analysis: CvAnalysis; blob: base64 }; savedJobDedupeHashes: string[]; letter: { jobDedupeHash; tone; language; length; content } }`, stored in `template-data.json`.
- `scripts/generate-demo-template.ts` (run by hand with real keys: `npx tsx scripts/generate-demo-template.ts`): reads `tests/fixtures/cv/sample.pdf`, runs the real analysis, picks the top 3 real matches from the DB, writes one real letter for the best one, and writes the JSON. The repo ships with a version generated with `AI_PROVIDER=mock` until the user runs it with real keys (document this in the README).
- `prisma/seed.ts`: seeds ~30 sample jobs (from `tests/fixtures/jobs/*`, normalised) with fake-embedder vectors when `EMBEDDINGS_PROVIDER=fake`, so local dev and e2e have data.

- [ ] **Step 1:** Write `seed.test.ts`: after the seed, there are ≥ 30 non-expired jobs with embeddings; `template-data.json` parses against the `DemoTemplate` schema.
- [ ] **Step 2:** Run. Expected: FAIL. Implement (generate the JSON with the mock). Run. Expected: PASS.
- [ ] **Step 3:** Commit `feat(demo): demo template data and development seed`.

### Task 15: Per-visitor demo accounts with Turnstile, IP limit and cleanup

**Files:**
- Create: `src/server/demo/{create-demo.ts,cleanup.ts,turnstile.ts}`, `src/app/api/demo/route.ts`, `src/components/demo/DemoButton.tsx`, `tests/int/demo.test.ts`
- Modify: `src/server/demo/cleanup.ts` (replace the Task 9 stub)

**Interfaces:**
- Produces `verifyTurnstile(token: string, ip: string): Promise<boolean>` (POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify`; returns `true` when `TURNSTILE_BYPASS`).
- Produces `createDemoUser(ip: string, now?: Date): Promise<{ userId: string }>`. It hashes the IP (sha256 + `BETTER_AUTH_SECRET` salt), increments `DemoSignup` atomically (limit 3/day → `AppError('DEMO_LIMIT', 'Demo limit reached for today. Create a free account instead.')`), and creates a user `demo-{cuid}@demo.local` with `isDemo=true`, `emailVerified=true`, `demoExpiresAt=now+24h` and no usable password. It then clones the template: uploads the blob to `cv/{userId}/…`, creates the `ANALYZED` CV with profile/analysis and an embedding (re-embedded via `getEmbedder` from `profileToText`), saves the jobs that still exist by dedupe hash, and pre-computes `MatchResult`s for them using the template scores when present. It also creates the letter if its job exists.
- Route `POST /api/demo` with body `{ turnstileToken }`: verify → `createDemoUser` → create a session through Better Auth's server API (`auth.api` session creation for a user id, or the documented equivalent) and set the cookie → `{ redirect: '/dashboard' }`.
- Produces `cleanupExpiredDemoUsers(now: Date): Promise<number>`: deletes demo users whose `demoExpiresAt < now`, plus their blobs (cascade handles the rows).
- UI: a "Try the demo — no sign-up" button on the landing and sign-in pages, with an invisible Turnstile widget; a demo banner in the app shell ("Demo account · expires in Xh · Create a real account").

- [ ] **Step 1:** Write tests: `createDemoUser` gives an analysed CV, ≥ 1 saved job and a letter; two demo users don't see each other's CVs (`getCv` across → `NotFoundError`); the 4th demo from the same IP on one day → `DEMO_LIMIT`; demo usage uses demo limits (2nd `CV_ANALYSIS` → `LimitExceededError`); `cleanupExpiredDemoUsers(now+25h)` deletes the user, the rows and the blobs, and leaves regular users alone; the route with a failing Turnstile → 403.
- [ ] **Step 2:** Run. Expected: FAIL. Implement. Run. Expected: PASS.
- [ ] **Step 3:** Commit `feat(demo): isolated per-visitor demo accounts with Turnstile and cleanup`.

### Task 16: App shell, dashboard and account settings

**Files:**
- Create: `src/app/(app)/layout.tsx` (sidebar/topbar shell), `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/settings/page.tsx`, `src/server/account/delete-account.ts`, `src/server/dashboard.ts`, `tests/int/account.test.ts`, `tests/int/dashboard.test.ts`

**Interfaces:**
- Produces `getDashboard(userId, isDemo): Promise<{ activeCv: { id; fileName; status; overallScore: number|null } | null; topMatches: MatchView[] /* cached only, max 5 */; recentLetters: { id; jobTitle; company; createdAt }[] /* max 5 */; savedJobsCount: number; usage: ReturnType<typeof getUsageSummary> }>`. No AI calls.
- Produces `deleteAccount(userId): Promise<void>`: deletes all of the user's blobs, then the user (cascade). The settings page asks the user to type `DELETE` to confirm, then signs out → `/`.
- Settings: the default AI output language (`en`|`pt`, stored on User as `preferredLanguage String @default("en")`; migration) and the usage summary.
- Shell: nav (Dashboard, CV, Jobs, Matches, Letters, Settings), user menu, demo banner, toasts for `AppError.userMessage`.

- [ ] **Step 1:** Write tests: `getDashboard` for a new user → nulls and empties; for the demo user → CV score, matches and a letter; `deleteAccount` removes the rows and blobs, and another user's data is untouched; `getDashboard` makes no `AiCall`.
- [ ] **Step 2:** Run. Expected: FAIL. Implement. Run. Expected: PASS. Build the shell and pages.
- [ ] **Step 3:** Commit `feat(app): dashboard, app shell and account settings with data deletion`.

### Task 17: Landing page and visual polish

**Files:**
- Create/Modify: `src/app/(marketing)/page.tsx`, `src/components/marketing/*`, `src/app/globals.css`, theme tokens, `src/app/icon.svg`, `src/app/opengraph-image.tsx`
- Test: `e2e/landing.spec.ts`

Use the `frontend-design` skill. The direction should be distinctive and professional (not the default shadcn look): a confident type pairing, one accent colour, and light/dark themes. Landing sections: hero (value prop + "Try the demo" + "Sign up"), the 3-step how-it-works (Upload → Match → Apply), a feature grid (analysis, matching, cover letters, interview simulator "coming soon"), a tech-stack strip, and a footer with the GitHub link. Pass the polish over the auth pages, empty states, loading skeletons and mobile layout of all app pages.

- [ ] **Step 1:** Write `e2e/landing.spec.ts`: the hero heading is visible; "Try the demo" and "Sign up" links exist; no console errors; there is no horizontal scroll at 375 px width.
- [ ] **Step 2:** Implement. Run `npm run build && npm run test:e2e -- landing`. Expected: PASS. Take screenshots (desktop + mobile, light + dark) into `docs/screenshots/`.
- [ ] **Step 3:** Commit `feat(ui): landing page and visual polish`.

### Task 18: End-to-end suite

**Files:**
- Create: `e2e/auth.spec.ts`, `e2e/core-flow.spec.ts`, `e2e/demo.spec.ts`, `e2e/helpers.ts`, `src/app/api/test/mail/route.ts` (exists only when `NODE_ENV !== 'production' && E2E === '1'`; returns the console mailer's `sentMessages`)
- Modify: `playwright.config.ts` (env: all fakes, `E2E=1`, `DATABASE_URL` → test DB, global setup runs migrate reset + seed), `ci.yml` (e2e job with a pgvector service)

- [ ] **Step 1:** `auth.spec.ts`: sign up → read the verification link from `/api/test/mail` → verify → dashboard; sign out; forgot password → reset link → new password works.
- [ ] **Step 2:** `core-flow.spec.ts`: a verified user uploads `sample.pdf` → sees the score → opens Matches → sees ≥ 1 match with a score → opens a job → writes a cover letter (mock stream) → edits it → it appears in `/letters`; pasting a manual job shows it in search.
- [ ] **Step 3:** `demo.spec.ts`: "Try the demo" (Turnstile bypass) → the dashboard shows the CV score, matches and a letter within 5 s; the demo banner is visible; a second analysis attempt shows the limit message.
- [ ] **Step 4:** Run `npm run test:e2e`. Expected: all PASS locally. Push and confirm the CI e2e job is green.
- [ ] **Step 5:** Commit `test(e2e): auth, core flow and demo end-to-end tests`.

### Task 19: Docs, ADRs and deployment readiness

**Files:**
- Create: `README.md`, `docs/adr/0001-nextjs-monolith.md`, `docs/adr/0003-fakes-for-external-services.md`, `docs/deploy.md`, `docs/architecture.svg` (or a Mermaid diagram in the README), `GLOSSARY.md` (CV, Profile, Analysis, Job, Manual job, Match, Re-rank, Ingest, Demo user, Usage action)
- Modify: `.env.example` (every key with a comment saying where to get it)

- [ ] **Step 1:** README: one-line pitch, live demo link placeholder, screenshots/GIF, feature list, architecture diagram, stack, a "How it works" section (ingest → embeddings → recall → re-rank), local setup (`docker compose up -d`, `cp .env.example .env.local`, `npm i`, `npx prisma migrate dev`, `npm run db:seed`, `npm run dev`, with all fakes by default so no keys are needed), testing commands, design decisions (links to ADRs), and limits/costs.
- [ ] **Step 2:** `docs/deploy.md`: a step-by-step for Neon (enable pgvector), Vercel (env vars, Blob store, build command `prisma migrate deploy && next build`), Resend domain/sender, Turnstile keys, Adzuna/Voyage/Anthropic keys, the GitHub secrets `APP_URL` + `CRON_SECRET` for `ingest.yml`, running `scripts/generate-demo-template.ts` once with real keys, and the first manual ingest via `workflow_dispatch`.
- [ ] **Step 3:** Verify: on a fresh clone in a temp dir, the README's local steps run the app with fakes and no keys. Expected: the dashboard loads and the demo works.
- [ ] **Step 4:** Commit `docs: README, ADRs, glossary and deployment guide`.

---

## After the plan (needs Rafael)
1. Create the accounts and keys from spec §9 (+ Resend, Turnstile) and add them to Vercel.
2. Deploy following `docs/deploy.md`; run `generate-demo-template.ts` with real keys; trigger the first ingest.
3. Put the live URL in the README.
