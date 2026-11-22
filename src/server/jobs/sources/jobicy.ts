import { z } from "zod";
import { JobSource } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import {
  EUROPE_COUNTRIES,
  isEligibleLocation,
  mentionsRegion,
  scopeFromCountries,
  scopeLabel,
} from "../eligibility";
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
  // "EMEA, LATAM, Canada, USA" is a list with a region in it, not a list of countries.
  return parts.length > 1 && !mentionsRegion(geo) ? scopeFromCountries(parts) : scopeLabel(geo);
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
    // The scope label is display text: keep it out of `location`, which feeds the dedupe hash.
    location: null,
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

/**
 * Jobicy's geo slugs for countries (from https://jobicy.com/api/v2/remote-jobs?get=locations; an
 * unknown slug is a 400). Keys are lowercase, without accents. geo=<country> returns the jobs
 * open to that country: its own, Europe/EMEA/Anywhere ones and lists that include it.
 */
export const JOBICY_COUNTRY_SLUGS: Record<string, string> = {
  argentina: "argentina",
  australia: "australia",
  austria: "austria",
  belgium: "belgium",
  brazil: "brazil",
  bulgaria: "bulgaria",
  canada: "canada",
  china: "china",
  "costa rica": "costa-rica",
  croatia: "croatia",
  cyprus: "cyprus",
  czechia: "czechia",
  denmark: "denmark",
  estonia: "estonia",
  finland: "finland",
  france: "france",
  germany: "germany",
  greece: "greece",
  "hong kong": "hong-kong",
  "hong kong sar china": "hong-kong",
  hungary: "hungary",
  ireland: "ireland",
  israel: "israel",
  italy: "italy",
  japan: "japan",
  latvia: "latvia",
  lithuania: "lithuania",
  malaysia: "malaysia",
  mexico: "mexico",
  netherlands: "netherlands",
  "new zealand": "new-zealand",
  norway: "norway",
  philippines: "philippines",
  poland: "poland",
  portugal: "portugal",
  romania: "romania",
  serbia: "serbia",
  singapore: "singapore",
  slovakia: "slovakia",
  slovenia: "slovenia",
  "south korea": "south-korea",
  spain: "spain",
  sweden: "sweden",
  switzerland: "switzerland",
  thailand: "thailand",
  turkey: "turkiye",
  turkiye: "turkiye",
  "united arab emirates": "united-arab-emirates",
  "united kingdom": "uk",
  ukraine: "ukraine",
  "united states": "usa",
  vietnam: "vietnam",
};

/** The geo slug to request for a candidate's country; Europe's feed (or Anywhere) as a fallback. */
export function jobicyGeoFor(country: string): string {
  const key = country
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim();
  const slug = JOBICY_COUNTRY_SLUGS[key];
  if (slug) return slug;
  return EUROPE_COUNTRIES.some((c) => c.toLowerCase() === key) ? "europe" : "anywhere";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Jobicy lists remote jobs with a `jobGeo` of who may apply. The feed is requested for the
 * candidate's own country (a Europe-wide feed holds mostly single-country jobs and no worldwide
 * ones); each job's `jobGeo` is still checked against `country` as a safety net.
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
      const geo = jobicyGeoFor(country);
      let cursor: string | null = null;
      for (let page = 1; page <= pages; page++) {
        const params = new URLSearchParams({
          count: String(SOURCES_CONFIG.jobicy.count),
          geo,
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
