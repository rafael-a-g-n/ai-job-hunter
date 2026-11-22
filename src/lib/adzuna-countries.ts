/**
 * Country codes the Adzuna jobs API accepts in /v1/api/jobs/{country}/search.
 * Source: the API's UNSUPPORTED_COUNTRY error message (checked 2026-11-22). Portugal is not on it.
 */
export const ADZUNA_SUPPORTED_COUNTRIES = [
  "at",
  "au",
  "be",
  "br",
  "ca",
  "ch",
  "de",
  "es",
  "fr",
  "gb",
  "in",
  "it",
  "mx",
  "nl",
  "nz",
  "pl",
  "sg",
  "us",
  "za",
] as const;

export type AdzunaCountry = (typeof ADZUNA_SUPPORTED_COUNTRIES)[number];

export const DEFAULT_ADZUNA_COUNTRIES: AdzunaCountry[] = ["es"];

/**
 * Each country costs queries × pages requests per ingest run (7 × 2 = 14). With 4 runs a day,
 * 4 countries use 224 of the free key's 250 requests a day.
 */
export const MAX_ADZUNA_COUNTRIES = 4;
