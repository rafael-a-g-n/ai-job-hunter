export const SOURCES_CONFIG = {
  adzuna: {
    // Countries come from ADZUNA_COUNTRIES (src/lib/env.ts); the API has no Portugal.
    queries: ["developer", "engineer", "designer", "data", "marketing", "sales", "customer"],
    resultsPerPage: 50,
    pages: 2,
  },
  arbeitnow: { pages: 3 },
  remotive: { limit: 300 },
} as const;
