import { z } from "zod";
import { JobSource } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { isEligibleLocation, scopeFromCountries, scopeLabel } from "../eligibility";
import { SOURCES_CONFIG } from "./config";
import type { JobSourceAdapter, NormalizedJob } from "./types";
import { getJson, htmlToText, parseDate, parseItems, stripHtml } from "./util";

const jobSchema = z.object({
  id: z.number(),
  url: z.string().min(1),
  jobTitle: z.string(),
  companyName: z.string(),
  jobGeo: z.string(),
  jobDescription: z.string().default(""),
  pubDate: z.string().optional(),
  salaryMin: z.number().nullish(),
  salaryMax: z.number().nullish(),
  salaryCurrency: z.string().nullish(),
  salaryPeriod: z.string().nullish(),
});

type RawJob = z.infer<typeof jobSchema>;

/** Jobicy writes lists as "Canada,  Poland,  Portugal"; single values like "Europe" or "EMEA". */
function geoParts(geo: string): string[] {
  return geo
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function labelFor(geo: string): string {
  const parts = geoParts(geo);
  return parts.length > 1 ? scopeFromCountries(parts) : scopeLabel(geo);
}

function toNormalized(j: RawJob): NormalizedJob {
  const scope = labelFor(j.jobGeo);
  const annual = j.salaryPeriod === "yearly";
  const salaryMin = annual ? (j.salaryMin ?? null) : null;
  const salaryMax = annual ? (j.salaryMax ?? null) : null;
  const hasSalary = salaryMin !== null || salaryMax !== null;
  return {
    source: JobSource.JOBICY,
    externalId: String(j.id),
    title: stripHtml(j.jobTitle),
    company: j.companyName.trim(),
    location: scope,
    remote: true,
    remoteScope: scope,
    description: htmlToText(j.jobDescription),
    // Jobicy's terms: apply buttons must go to the original job URL from the feed.
    url: j.url,
    salaryMin,
    salaryMax,
    currency: hasSalary ? j.salaryCurrency || null : null,
    postedAt: parseDate(j.pubDate),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Jobicy lists remote jobs with a `jobGeo` of who may apply. The geo=europe feed still contains
 * jobs for single countries (Germany, Poland...), so each one is checked against `country`.
 * Jobicy asks for at least 1 second between requests from one IP.
 */
export function createJobicyAdapter(
  country: string,
  pages: number = SOURCES_CONFIG.jobicy.pages,
  delayMs: number = SOURCES_CONFIG.jobicy.delayMs,
): JobSourceAdapter {
  return {
    source: JobSource.JOBICY,
    minIntervalHours: 6,
    async fetchJobs(fetchFn = fetch) {
      const byId = new Map<string, NormalizedJob>();
      let cursor: string | null = null;
      for (let page = 1; page <= pages; page++) {
        const params = new URLSearchParams({
          count: String(SOURCES_CONFIG.jobicy.count),
          geo: "europe",
        });
        if (cursor) params.set("cursor", cursor);
        const url = `https://jobicy.com/api/v2/remote-jobs?${params}`;
        let json: unknown;
        let rows: RawJob[];
        try {
          json = await getJson("Jobicy", url, fetchFn);
          rows = parseItems("Jobicy", json, "jobs", jobSchema);
        } catch (err) {
          // Keep what the first page gave (a 429 on the second should not discard it).
          if (page === 1) throw err;
          console.warn(`Jobicy: stopped at page ${page}: ${(err as Error).message}`);
          break;
        }
        for (const j of rows) {
          const id = String(j.id);
          if (!byId.has(id) && isEligibleLocation(j.jobGeo, country)) {
            byId.set(id, toNormalized(j));
          }
        }
        const next = (json as { nextCursor?: unknown }).nextCursor;
        cursor = typeof next === "string" && next ? next : null;
        if (!cursor) break;
        if (page < pages) await sleep(delayMs);
      }
      return [...byId.values()];
    },
  };
}

export function jobicyAdapterFromEnv(): JobSourceAdapter {
  return createJobicyAdapter(env.CANDIDATE_COUNTRY);
}
