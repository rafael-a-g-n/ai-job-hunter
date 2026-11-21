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
| Voyage AI | dash.voyageai.com, API keys. Add a payment method: without one the account is limited to 3 requests per minute, too few for ingest (the free token allowance still applies once a card is on file). | `VOYAGE_API_KEY` |
| Adzuna | developer.adzuna.com, free app id and key (optional; the source is skipped without them) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| Resend | resend.com: add and verify a sending domain (DNS records), then create an API key | `RESEND_API_KEY`, `EMAIL_FROM` |
| Cloudflare Turnstile | Cloudflare dashboard, Turnstile, add a widget for your Vercel domain | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public), `TURNSTILE_SECRET_KEY` |

`EMAIL_FROM` must use the domain you verified in Resend, for example `AI Job Hunter <noreply@yourdomain.com>`.

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
   | `AI_PROVIDER` | `anthropic` |
   | `ANTHROPIC_API_KEY` | from step 2 |
   | `EMBEDDINGS_PROVIDER` | `voyage` |
   | `VOYAGE_API_KEY` | from step 2 |
   | `STORAGE_PROVIDER` | `vercel-blob` |
   | `BLOB_READ_WRITE_TOKEN` | added by the Blob store |
   | `MAIL_PROVIDER` | `resend` |
   | `RESEND_API_KEY` | from step 2 |
   | `EMAIL_FROM` | verified sender |
   | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | optional |
   | `CRON_SECRET` | `openssl rand -hex 32` (reuse it in GitHub, step 4) |
   | `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | from step 2 |
   | `TURNSTILE_BYPASS` | `false` (**must not be `true` in production**; it skips the bot check) |
   | `GLOBAL_DAILY_AI_BUDGET_USD` | for example `5` |

   `NEXT_PUBLIC_*` values are inlined at build time, so redeploy after changing the site key.
5. Deploy.

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

- **Better Auth rate limiting.** It is enabled and uses in-memory counters by default, which do not hold across serverless instances. For a stricter setup set `rateLimit: { storage: "database" }` in `src/lib/auth.ts` (this needs a `rateLimit` table; see the Better Auth docs). Not done in v1.
- **Upload size.** Vercel functions accept request bodies up to 4.5 MB, so CV uploads (sent through a server action) are capped at 4 MB, with `bodySizeLimit: "5mb"` in `next.config.ts` leaving room for the form overhead.
- **Client IP.** The demo's per-IP cap reads the first `x-forwarded-for` entry. That header is only trustworthy behind Vercel's proxy. If you host elsewhere, put a proxy in front that overwrites it.
- **Seed data.** Do not run `npm run db:seed` against production: its jobs carry fake vectors.
- **Vercel Hobby cron** runs at most daily, which is why ingest uses GitHub Actions ([ADR 2](adr/0002-ingest-not-live-search.md)).
