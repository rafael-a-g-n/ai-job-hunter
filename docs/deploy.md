# Deployment guide

Target setup: Neon (Postgres + pgvector), Vercel (app + Blob), GitHub Actions (scheduled ingest). All have free tiers.

## 1. Neon

1. Create a project and a database. Copy the **pooled** connection string; it becomes `DATABASE_URL` (used by the app). Copy the **direct** (unpooled) connection string too; it becomes `DIRECT_DATABASE_URL`, which the Prisma CLI uses for migrations (`prisma.config.ts`; it falls back to `DATABASE_URL` when unset).
2. Enable pgvector: run `CREATE EXTENSION IF NOT EXISTS vector;` in the Neon SQL editor. (The initial migration also creates the extension; doing it first confirms your plan supports it.)
3. Apply migrations from your machine against the Neon URL:
   ```bash
   DIRECT_DATABASE_URL="<neon direct url>" npx prisma migrate deploy
   ```
   Do not use `migrate dev` or `migrate reset` against this database.

## 2. Accounts and keys

| Service | Where | Env variables |
|---|---|---|
| Anthropic | console.anthropic.com, API keys. Set a spend limit there too. | `ANTHROPIC_API_KEY` |
| Google AI Studio | aistudio.google.com/apikey, create an API key (free tier, see "Free tier: Google Gemini" below). Alternative to Anthropic, and to Voyage for embeddings (same key). | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Voyage AI | dash.voyageai.com, API keys. Add a payment method: without one the account is limited to 3 requests per minute, too few for ingest (the free token allowance still applies once a card is on file). | `VOYAGE_API_KEY` |
| Adzuna | developer.adzuna.com, free app id and key (optional; the source is skipped without them) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| Resend | resend.com: add and verify a sending domain (DNS records), then create an API key | `RESEND_API_KEY`, `EMAIL_FROM` |
| Brevo | app.brevo.com: verify a single sender email (no own domain needed), then create an API key (see "Free tier: Brevo" below). Alternative to Resend. | `BREVO_API_KEY`, `EMAIL_FROM` |
| Cloudflare Turnstile | Cloudflare dashboard, Turnstile, add a widget for your Vercel domain | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public), `TURNSTILE_SECRET_KEY` |

`EMAIL_FROM` must be a sender the provider has verified. With Resend that is an address on the domain you verified, for example `AI Job Hunter <noreply@yourdomain.com>`; with Brevo it is exactly the verified single sender, for example `AI Job Hunter <you@gmail.com>`.

## 3. Vercel

1. Import the GitHub repository as a new project (framework: Next.js).
2. Storage tab: create a **Blob** store and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.
3. Set the build command to:
   ```
   prisma migrate deploy && next build
   ```
   This applies pending migrations on every deploy, so `DIRECT_DATABASE_URL` (or `DATABASE_URL`) must be available at build time.
4. Environment variables (Production). Every key is validated in `src/lib/env.ts`:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled URL |
   | `DIRECT_DATABASE_URL` | Neon direct (unpooled) URL, for migrations |
   | `APP_URL` | Your production URL, for example `https://your-app.vercel.app` (no trailing slash) |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (at least 32 chars) |
   | `AI_PROVIDER` | `anthropic`, or `google` for Gemini |
   | `ANTHROPIC_API_KEY` | from step 2 (when `AI_PROVIDER=anthropic`) |
   | `GOOGLE_GENERATIVE_AI_API_KEY` | from step 2 (when `AI_PROVIDER=google` or `EMBEDDINGS_PROVIDER=gemini`) |
   | `EMBEDDINGS_PROVIDER` | `voyage`, or `gemini` for Gemini Embedding |
   | `VOYAGE_API_KEY` | from step 2 (when `EMBEDDINGS_PROVIDER=voyage`) |
   | `STORAGE_PROVIDER` | `vercel-blob` |
   | `BLOB_READ_WRITE_TOKEN` | added by the Blob store |
   | `MAIL_PROVIDER` | `resend`, or `brevo` |
   | `RESEND_API_KEY` | from step 2 (when `MAIL_PROVIDER=resend`) |
   | `BREVO_API_KEY` | from step 2 (when `MAIL_PROVIDER=brevo`) |
   | `EMAIL_FROM` | sender verified with the mail provider (Resend: an address on the verified domain; Brevo: the verified single sender) |
   | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | optional |
   | `CRON_SECRET` | `openssl rand -hex 32` (reuse it in GitHub, step 4) |
   | `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | from step 2 |
   | `TURNSTILE_BYPASS` | `false` (**must not be `true` in production**; it skips the bot check) |
   | `GLOBAL_DAILY_AI_BUDGET_USD` | for example `5` |

   `NEXT_PUBLIC_*` values are inlined at build time, so redeploy after changing the site key.
5. Deploy.

### Free tier: Brevo

Setting `MAIL_PROVIDER=brevo` sends verification and reset emails through Brevo's free plan, which needs no own domain.

1. Create an account at brevo.com.
2. Senders, Domains & Dedicated IPs, Senders, add a sender with the email address you want to send from, and click the confirmation link Brevo emails to it.
3. SMTP & API, API Keys, generate a key and set it as `BREVO_API_KEY`.
4. Set `EMAIL_FROM` to exactly that verified sender, for example `AI Job Hunter <you@gmail.com>`. Brevo rejects other senders.

- The free plan has a daily sending limit (300 emails per day, **unverified: check before go-live** on Brevo's pricing page, https://www.brevo.com/pricing/). Past it, sign-ups cannot receive their verification email.
- Without your own domain (no SPF/DKIM/DMARC alignment for the sender address) some messages may land in spam, especially with a free-mail sender such as Gmail. Tell testers to check the spam folder.

### Free tier: Google Gemini

Setting `AI_PROVIDER=google` runs the app on the Gemini API free tier (`gemini-3.5-flash-lite` for the CV analysis, job normalising and re-rank, `gemini-3.6-flash` for cover letters only), so no Anthropic account is needed. Calls ask for minimal thinking (`thinkingLevel: "minimal"`), because Gemini 3.x thinking tokens count against the output cap and could otherwise truncate answers.

- On the free tier Google may use prompts and responses to improve its products. That includes the text of uploaded CVs, so tell users before enabling it for real people, or use a paid Gemini key (which is not used for training).
- **Check before go-live:** the free-tier limits (requests per minute and per day) and the prices in `src/server/ai/models.ts` are not verified against your account. In AI Studio (aistudio.google.com, Usage and rate limits) confirm that the free tier is available for your account and region and read the limits for these two models; also see https://ai.google.dev/gemini-api/docs/pricing. A limit that is too low shows up as failed AI calls.
- The free tier bills $0, but the app records a cost from Gemini's paid list prices (`src/server/ai/models.ts`), so `GLOBAL_DAILY_AI_BUDGET_USD` still acts as an abuse cap. Those list prices are higher than the Anthropic ones for the same tier (flash-lite costs more than Haiku, and thinking is billed as output), so the budget trips sooner than with Claude. On the free tier the real cap is Google's requests per day, not the dollar budget.

Setting `EMBEDDINGS_PROVIDER=gemini` embeds with `gemini-embedding-001` through the same key (no Voyage account needed). Vectors are requested at 1024 dimensions, so the database columns stay as they are, and are L2-normalised in the app.

- **Check before go-live:** Google does not publish free-tier numbers for embeddings in its docs; check the limits for "Gemini Embedding" in AI Studio (Usage and rate limits). The app assumes roughly 100 requests/min, 30k tokens/min and 1,000 requests/day, with every text in a batch counted as a request. These figures are unverified.
- To stay inside that, one ingest run embeds at most 40 jobs in total, shared by all sources (Voyage: 500 per source). New jobs, the repair of earlier failures and manual jobs share that budget, oldest first, so a backlog drains over the next runs (ingest runs every 6 hours). A Gemini 429 waits the `retryDelay` Google sends (at most 10 s; longer waits fail the batch), and after a failure the rest of the run embeds nothing.
- An embedding failure is reported as `embedError` in the ingest response and does not count as a failed fetch, so the source's fetch interval still applies; the jobs are embedded by a later run.
- Long texts are truncated to 6,000 characters before embedding with Gemini, so a very long CV is matched on its opening part.
- **Switching embedding provider requires re-embedding.** Vectors from different models are not comparable, so after changing `EMBEDDINGS_PROVIDER` between `voyage` and `gemini` (or the fake), clear the old ones in the Neon SQL editor:

  ```sql
  UPDATE "Job" SET embedding = NULL;
  UPDATE "Cv" SET embedding = NULL;
  ```

  Jobs are re-embedded by the next ingest (`embedMissing`, up to the per-run budget above; matches only show jobs that have a vector, so they reappear as ingest catches up). This includes jobs users added manually: each ingest run also embeds non-expired manual jobs without a vector, after the sources and from what is left of the budget. CVs are re-embedded lazily: the next time a user opens the matches page, `ensureCvEmbedding` sees the missing vector and embeds the stored CV profile (one request). Until then, nothing else is needed.

## 4. GitHub Actions secrets

In the repository settings, Secrets and variables, Actions, add:

- `APP_URL`: the same value as the Vercel `APP_URL`.
- `CRON_SECRET`: the same value as the Vercel `CRON_SECRET`.

`.github/workflows/ingest.yml` then calls `POST $APP_URL/api/cron/ingest` every 6 hours with `Authorization: Bearer $CRON_SECRET`.

## 5. First ingest

Actions tab, "Ingest jobs", "Run workflow". The step fails on a non-2xx response. The route returns 200 with a per-source report (`fetched` and `inserted` counts, plus an `error` for a source that failed), which you can read by calling the endpoint with curl. The function has a 60 s limit; if a first run reports timeouts, run it again.

## 6. Demo template (once, with real keys)

After the first ingest the database has real embedded jobs. Regenerate the demo account's content with real AI output:

```bash
# .env.local: AI_PROVIDER=anthropic, EMBEDDINGS_PROVIDER=voyage, the two keys,
# and DATABASE_URL pointing at Neon
npx tsx scripts/generate-demo-template.ts
git add src/server/demo/template-data.json
git commit -m "chore: regenerate demo template with real AI output"
git push
```

The script writes only the JSON file, not the database, and uses no daily limits. Vercel redeploys on push.

## 7. Checklist

- [ ] Landing page loads; "Try the demo" opens a dashboard with matches.
- [ ] Sign-up sends a verification email from your domain.
- [ ] `TURNSTILE_BYPASS` is `false`.
- [ ] The live URL is in the README.

## Notes

- **Better Auth rate limiting.** Counters live in the `rateLimit` table (`storage: "database"` in `src/lib/auth.ts`), so they hold across serverless instances. Sign-up, password-reset and verification emails allow 3 requests per 10 minutes per IP; email sign-in allows 5 per minute.
- **Upload size.** Vercel functions accept request bodies up to 4.5 MB, so CV uploads (sent through a server action) are capped at 4 MB, with `bodySizeLimit: "5mb"` in `next.config.ts` leaving room for the form overhead.
- **Client IP.** The demo's per-IP cap reads the first `x-forwarded-for` entry. That header is only trustworthy behind Vercel's proxy. If you host elsewhere, put a proxy in front that overwrites it.
- **Seed data.** Do not run `npm run db:seed` against production: its jobs carry fake vectors.
- **Vercel Hobby cron** runs at most daily, which is why ingest uses GitHub Actions ([ADR 2](adr/0002-ingest-not-live-search.md)).
