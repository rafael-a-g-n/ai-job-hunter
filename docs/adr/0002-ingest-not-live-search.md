# 2. Scheduled ingestion instead of live search

Status: accepted (2026-11-21)

## Context

Job matching needs embeddings and vector search over many jobs. Querying the job APIs live per user request would be slow, would burn the free-tier rate limits of Adzuna, Arbeitnow and Remotive (Remotive asks for at most one fetch per day), and could not use pgvector.

## Decision

Ingest jobs on a schedule into our own database.

- A GitHub Actions workflow calls `POST /api/cron/ingest` every 6 hours, authenticated with `CRON_SECRET`.
- Each source has a minimum interval (Remotive: 24 h); a source fetched successfully more recently is skipped.
- Jobs are deduplicated by a hash of title, company and location, embedded once on insert, and expire 30 days after `postedAt` (or `fetchedAt`). Manual jobs never expire.
- Sources run concurrently with a 25 s deadline each. One failing source is reported in its own entry and does not stop the others; the route still returns 200.
- The same run deletes expired demo users.

## Consequences

- Results can be up to 6 hours stale.
- Matching is fast, independent of the job APIs at request time, and uses a single vector index.
- A source outage only means no new jobs from that source.
