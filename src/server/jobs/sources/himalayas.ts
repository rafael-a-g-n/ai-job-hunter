import { z } from "zod";
import { JobSource } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { scopeFromCountries } from "../eligibility";
import { SOURCES_CONFIG } from "./config";
import type { JobSourceAdapter, NormalizedJob } from "./types";
import { getJson, htmlToText, parseDate, parseItems, stripHtml } from "./util";

const jobSchema = z.object({
  guid: z.string().min(1),
  title: z.string(),
  companyName: z.string(),
  applicationLink: z.string().optional(),
  locationRestrictions: z.array(z.string()),
  minSalary: z.number().nullish(),
  maxSalary: z.number().nullish(),
  salaryPeriod: z.string().nullish(),
  currency: z.string().nullish(),
  pubDate: z.number().optional(),
  expiryDate: z.number().optional(),
  description: z.string().default(""),
});

type RawJob = z.infer<typeof jobSchema>;

const sameCountry = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function toNormalized(j: RawJob): NormalizedJob {
  const scope = scopeFromCountries(j.locationRestrictions);
  const annual = j.salaryPeriod === "annual";
  const salaryMin = annual ? (j.minSalary ?? null) : null;
  const salaryMax = annual ? (j.maxSalary ?? null) : null;
  const hasSalary = salaryMin !== null || salaryMax !== null;
  return {
    source: JobSource.HIMALAYAS,
    externalId: j.guid,
    title: stripHtml(j.title),
    company: j.companyName.trim(),
    // The scope label is display text: keep it out of `location`, which feeds the dedupe hash.
    location: null,
    remote: true,
    remoteScope: scope,
    description: htmlToText(j.description),
    // Himalayas' terms: every apply action must use the supplied applicationLink.
    url: j.applicationLink || j.guid,
    salaryMin,
    salaryMax,
    currency: hasSalary ? j.currency || null : null,
    postedAt: j.pubDate === undefined ? null : parseDate(j.pubDate * 1000),
    expiresAt: j.expiryDate === undefined ? null : parseDate(j.expiryDate * 1000),
  };
}

/**
 * Himalayas' search endpoint already returns jobs a candidate in `country` can apply to (an empty
 * locationRestrictions means worldwide); the check on the list is a second line of defence.
 */
export function createHimalayasAdapter(
  country: string,
  pages: number = SOURCES_CONFIG.himalayas.pages,
): JobSourceAdapter {
  return {
    source: JobSource.HIMALAYAS,
    minIntervalHours: 6,
    async fetchJobs(fetchFn = fetch) {
      const byId = new Map<string, NormalizedJob>();
      for (let page = 1; page <= pages; page++) {
        const url = `https://himalayas.app/jobs/api/search?country=${encodeURIComponent(country)}&page=${page}`;
        let rows: RawJob[];
        try {
          rows = parseItems(
            "Himalayas",
            await getJson("Himalayas", url, fetchFn),
            "jobs",
            jobSchema,
          );
        } catch (err) {
          // Keep what earlier pages gave (a 429 on a later page should not discard them).
          if (page === 1) throw err;
          console.warn(`Himalayas: stopped at page ${page}: ${(err as Error).message}`);
          break;
        }
        for (const j of rows) {
          const open =
            j.locationRestrictions.length === 0 ||
            j.locationRestrictions.some((c) => sameCountry(c, country));
          if (open && !byId.has(j.guid)) byId.set(j.guid, toNormalized(j));
        }
        if (rows.length === 0) break;
      }
      return [...byId.values()];
    },
  };
}

export function himalayasAdapterFromEnv(): JobSourceAdapter {
  return createHimalayasAdapter(env.CANDIDATE_COUNTRY);
}
