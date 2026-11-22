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
  remotive: { limit: 300 },
} as const;
