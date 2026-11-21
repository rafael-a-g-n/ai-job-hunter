# 5. Behaviour rulings made during the build

Status: accepted (2026-11-21)

Small decisions that changed behaviour and are easy to get wrong when reading the code.

- **CV activation follows analysis success.** A CV becomes the active one only when its analysis succeeds. A failed upload or analysis never replaces a working CV.
- **AI cost rows outlive users.** `AiCall.userId` is `onDelete: SetNull`. The global daily AI budget sums these rows, so deleting an account (or letting a demo user expire) must not lower today's spend.
- **Demo templates carry pre-generated re-rank scores.** A new demo account starts with its matches already scored, so the first visit makes no AI call. Template data is produced by `scripts/generate-demo-template.ts` and committed as JSON.
- **Demo sessions end at `demoExpiresAt`.** Demo users last 24 h; the session stops working at that time and the ingest run deletes the user and its blobs. At most 3 demo accounts per IP hash per day, counted in a single SQL statement.
- **Failed AI work is refunded.** Usage is consumed before the call (one atomic SQL statement, so parallel requests cannot pass the limit) and refunded if the call fails after one retry. Scans and empty files are rejected before any AI call and consume nothing.
- **Tests never run `prisma migrate reset`.** Integration tests run `migrate deploy` against the `db-test` database and truncate tables before each test, behind a guard that refuses anything but the local test database (port 5433 or a name ending in `_test`).
