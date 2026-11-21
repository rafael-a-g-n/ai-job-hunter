export const SOURCES_CONFIG = {
  adzuna: {
    countries: ["pt"],
    queries: ["developer", "engineer", "designer", "data", "marketing", "sales", "customer"],
    resultsPerPage: 50,
    pages: 2,
  },
  arbeitnow: { pages: 3 },
  remotive: { limit: 300 },
} as const;
