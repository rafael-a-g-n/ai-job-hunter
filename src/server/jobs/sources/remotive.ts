import { z } from "zod";
import { JobSource } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { isEligibleLocation, scopeLabel } from "../eligibility";
import { SOURCES_CONFIG } from "./config";
import type { JobSourceAdapter } from "./types";
import { getJson, htmlToText, parseItems, parseDate, stripHtml } from "./util";

const jobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  url: z.string(),
  title: z.string(),
  company_name: z.string(),
  publication_date: z.string().optional(),
  candidate_required_location: z.string().optional(),
  description: z.string().default(""),
});

/** `candidateCountry` null keeps every job (recorded fixtures); otherwise only eligible ones. */
export function createRemotiveAdapter(candidateCountry: string | null): JobSourceAdapter {
  return {
    source: JobSource.REMOTIVE,
    minIntervalHours: 24,
    async fetchJobs(fetchFn = fetch) {
      const json = await getJson(
        "Remotive",
        `https://remotive.com/api/remote-jobs?limit=${SOURCES_CONFIG.remotive.limit}`,
        fetchFn,
      );
      return parseItems("Remotive", json, "jobs", jobSchema)
        .filter(
          (j) =>
            candidateCountry === null ||
            isEligibleLocation(j.candidate_required_location ?? "", candidateCountry),
        )
        .map((j) => ({
          source: JobSource.REMOTIVE,
          externalId: String(j.id),
          title: stripHtml(j.title),
          company: j.company_name.trim(),
          location: j.candidate_required_location?.trim() || null,
          remote: true,
          remoteScope: scopeLabel(j.candidate_required_location ?? ""),
          description: htmlToText(j.description),
          url: j.url,
          // Remotive salary is free text ("$14/hour"); not reliably parseable.
          salaryMin: null,
          salaryMax: null,
          currency: null,
          // publication_date is UTC without a zone suffix
          postedAt: parseDate(j.publication_date ? `${j.publication_date}Z` : undefined),
        }));
    },
  };
}

export function remotiveAdapterFromEnv(): JobSourceAdapter {
  return createRemotiveAdapter(env.CANDIDATE_COUNTRY);
}
