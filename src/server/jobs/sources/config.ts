export const SOURCES_CONFIG = {
  adzuna: {
    // Countries come from ADZUNA_COUNTRIES (src/lib/env.ts); the API has no Portugal.
    queries: ["developer", "engineer", "designer", "data", "marketing", "sales", "customer"],
    resultsPerPage: 50,
    pages: 2,
  },
  arbeitnow: { pages: 3 },
  // 20 jobs per page; 10 pages is at most 200 jobs per run, fetched one page at a time.
  himalayas: { pages: 10 },
  // 100 jobs per request (their maximum), at most two requests a run, 1 s apart (their rule).
  jobicy: { count: 100, pages: 2, delayMs: 1100 },
  remotive: { limit: 300 },
} as const;
