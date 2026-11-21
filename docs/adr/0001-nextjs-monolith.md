# 1. One Next.js app instead of a separate backend

Status: accepted (2026-11-21)

## Context

The project is a portfolio piece. A recruiter opens the link, tries it for two to five minutes, and may skim the code. It has to answer immediately, run on free tiers, and stay cheap to maintain. The design spec compared three approaches:

| | Approach | For | Against |
|---|---|---|---|
| A | Next.js full stack (TypeScript) on Vercel, Postgres on Neon | One codebase, no cold start, native AI streaming, simple deploy | No separate backend to show off |
| B | React + FastAPI + Postgres + worker | Classic architecture, Python | Two deployments; a free backend sleeps and the first click waits 30 s or more |
| C | React + NestJS | All TypeScript, separate backend | Same hosting problems as B with fewer upsides |

## Decision

Approach A: a single Next.js (App Router) application in strict TypeScript.

- UI in React Server Components; mutations in Server Actions; Route Handlers only where HTTP is required (`/api/auth`, `/api/cron/ingest`, `/api/demo`, `/api/letters/stream`).
- Business logic lives in `src/server/**`, which has no dependency on Next. Every function that touches user data takes a `userId` and scopes its query by it.
- Postgres with pgvector (Neon in production) through Prisma. Scheduling comes from GitHub Actions, because Vercel Hobby cron runs once a day at most (see [ADR 2](0002-ingest-not-live-search.md)).

## Consequences

- One deploy, no sleeping server, token streaming works without extra infrastructure.
- The server layer is plain functions, so it is unit and integration tested without a running Next server.
- Vercel function time limits apply: the ingest and demo routes set `maxDuration = 60`, and ingest bounds each source to 25 s.
- Splitting out a backend later means moving `src/server/**` behind an API; the boundaries already allow it, but this is not a goal.
