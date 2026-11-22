# Glossary

Domain terms as the code and UI use them.

**CV**: An uploaded PDF or DOCX file (max 4 MB) and what the app derives from it: extracted text, a Profile, an Analysis and an embedding. A user may have several; one is active.

**Profile**: The structured data extracted from a CV (contact, skills, experience, education, summary). Editable by the user. Cover letters may only use facts present in the Profile.

**Analysis**: The AI review of a CV: a 0 to 100 score and notes on structure, impact and keywords. A CV is `ANALYZED` when this succeeds and `FAILED` when it does not.

**Job**: A posting stored in our database, either ingested from a source (Himalayas, Remotive, Jobicy; Arbeitnow and Adzuna are optional) or a Manual job. Ingested jobs are embedded once and expire 30 days after `postedAt` (or `fetchedAt`).

**Manual job**: A job the user pasted as text. The AI normalizes it into a Job owned by that user. It is visible only to its owner and expires 365 days after it was added.

**Match**: The pairing of a CV with a Job: a vector similarity, plus, once re-ranked, a 0 to 100 score, matched skills, gaps and an explanation. Re-ranked matches are cached per CV and job.

**Re-rank**: One AI call that scores the top 10 recalled jobs without a cached score against the Profile. Recall (pgvector, 50 nearest jobs) comes first. If re-rank cannot run, results fall back to vector order.

**Ingest**: The scheduled run (every 6 h, via `POST /api/cron/ingest`) that fetches jobs from all sources, deduplicates, embeds, expires old jobs and deletes expired demo users. It returns a per-source report; one source failing does not stop the others.

**Demo user**: A temporary account created by one click, pre-filled from the demo template (CV, saved jobs, matches, one letter). It lasts 24 h, has lower Usage limits, and is capped at 3 per IP hash per day.

**Usage action**: A metered kind of AI work: `CV_ANALYSIS`, `COVER_LETTER`, `MATCH_RERANK`, `JOB_NORMALIZE`. Each has a daily limit per user (UTC day), lower for demo users, and counts against the global daily AI budget.
