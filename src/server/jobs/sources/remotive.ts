import { z } from "zod";
import { JobSource } from "@/generated/prisma/client";
import { SOURCES_CONFIG } from "./config";
import type { JobSourceAdapter } from "./types";
import { getJson, parseItems, parseDate, stripHtml } from "./util";

const jobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  url: z.string(),
  title: z.string(),
  company_name: z.string(),
  publication_date: z.string().optional(),
  candidate_required_location: z.string().optional(),
  description: z.string().default(""),
});

export const remotiveAdapter: JobSourceAdapter = {
  source: JobSource.REMOTIVE,
  minIntervalHours: 24,
  async fetchJobs(fetchFn = fetch) {
    const json = await getJson(
      "Remotive",
      `https://remotive.com/api/remote-jobs?limit=${SOURCES_CONFIG.remotive.limit}`,
      fetchFn,
    );
    return parseItems("Remotive", json, "jobs", jobSchema).map((j) => ({
      source: JobSource.REMOTIVE,
      externalId: String(j.id),
      title: stripHtml(j.title),
      company: j.company_name.trim(),
      location: j.candidate_required_location?.trim() || null,
      remote: true,
      description: stripHtml(j.description),
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
