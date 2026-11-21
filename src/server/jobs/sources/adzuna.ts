import { z } from "zod";
import { JobSource } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { SOURCES_CONFIG } from "./config";
import type { JobSourceAdapter, NormalizedJob } from "./types";
import { getJson, parseDate, stripHtml } from "./util";

// Adzuna does not return a currency; it follows the country of the search.
const CURRENCY: Record<string, string> = {
  pt: "EUR",
  es: "EUR",
  fr: "EUR",
  de: "EUR",
  it: "EUR",
  nl: "EUR",
  at: "EUR",
  be: "EUR",
  gb: "GBP",
  us: "USD",
  ca: "CAD",
  au: "AUD",
  nz: "NZD",
  pl: "PLN",
  br: "BRL",
  in: "INR",
  sg: "SGD",
  za: "ZAR",
  mx: "MXN",
  ch: "CHF",
};

const jobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  description: z.string().default(""),
  created: z.string().optional(),
  redirect_url: z.string(),
  company: z.object({ display_name: z.string().optional() }).optional(),
  location: z.object({ display_name: z.string().optional() }).optional(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
});
const responseSchema = z.object({ results: z.array(jobSchema) });

export function adzunaUrl(
  country: string,
  page: number,
  query: string,
  creds: { appId: string; appKey: string },
): string {
  const params = new URLSearchParams({
    app_id: creds.appId,
    app_key: creds.appKey,
    what: query,
    results_per_page: String(SOURCES_CONFIG.adzuna.resultsPerPage),
  });
  return `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`;
}

function mapJob(job: z.infer<typeof jobSchema>, country: string): NormalizedJob {
  const hasSalary = job.salary_min != null || job.salary_max != null;
  const title = stripHtml(job.title);
  const description = stripHtml(job.description);
  return {
    source: JobSource.ADZUNA,
    externalId: String(job.id),
    title,
    company: job.company?.display_name?.trim() || "Unknown company",
    location: job.location?.display_name?.trim() || null,
    remote: /\bremote\b/i.test(`${title} ${description}`),
    description,
    url: job.redirect_url,
    salaryMin: job.salary_min ?? null,
    salaryMax: job.salary_max ?? null,
    currency: hasSalary ? (CURRENCY[country] ?? null) : null,
    postedAt: parseDate(job.created),
  };
}

export function createAdzunaAdapter(creds: { appId: string; appKey: string }): JobSourceAdapter {
  return {
    source: JobSource.ADZUNA,
    minIntervalHours: 6,
    async fetchJobs(fetchFn = fetch) {
      const byId = new Map<string, NormalizedJob>();
      for (const country of SOURCES_CONFIG.adzuna.countries) {
        for (const query of SOURCES_CONFIG.adzuna.queries) {
          for (let page = 1; page <= SOURCES_CONFIG.adzuna.pages; page++) {
            const json = await getJson("Adzuna", adzunaUrl(country, page, query, creds), fetchFn);
            for (const r of responseSchema.parse(json).results) {
              const job = mapJob(r, country);
              byId.set(job.externalId, job);
            }
          }
        }
      }
      return [...byId.values()];
    },
  };
}

export function adzunaAdapterFromEnv(): JobSourceAdapter | null {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) return null;
  return createAdzunaAdapter({ appId: env.ADZUNA_APP_ID, appKey: env.ADZUNA_APP_KEY });
}
