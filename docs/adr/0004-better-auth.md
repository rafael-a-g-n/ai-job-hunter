# 4. Better Auth instead of Auth.js v5

Status: accepted (2026-11-21)

## Context

The design spec (section 5) named Auth.js v5. Since late 2025 Auth.js is maintained by the Better Auth team, who recommend Better Auth for new projects.

## Decision

Use Better Auth. It ships email verification, password reset, rate limiting, a Prisma adapter and GitHub OAuth (planned for v1.2) out of the box.

- Email and password with `requireEmailVerification: true` and a minimum password length of 8.
- Verification and reset emails go through our own `Mailer` (`MAIL_PROVIDER=resend|console`).
- Demo flags live on the user (`isDemo`, `demoExpiresAt`) as non-input additional fields.
- Built-in rate limiting stays enabled.
- Route protection: `src/proxy.ts` (Next 16's name for middleware) checks only for the session cookie; `requireUser()` does the authoritative check on the server.

## Consequences

- Auth tables are Better Auth's core models (`user`, `session`, `account`, `verification`), kept in `prisma/schema.prisma`.
- A duplicate sign-up answers with a synthetic success rather than an error, so account existence is not leaked.
- Deviates from the spec's wording; the spec stays as the record of the original plan.
