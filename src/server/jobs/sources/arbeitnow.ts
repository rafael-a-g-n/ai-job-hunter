import { z } from "zod";
import { JobSource } from "@/generated/prisma/client";
import { SOURCES_CONFIG } from "./config";
import type { JobSourceAdapter, NormalizedJob } from "./types";
import { getJson, parseItems, parseDate, stripHtml } from "./util";

const jobSchema = z.object({
  slug: z.string(),
  company_name: z.string(),
  title: z.string(),
  description: z.string().default(""),
  remote: z.boolean().default(false),
  url: z.string(),
  location: z.string().default(""),
  created_at: z.number().optional(),
});

export const arbeitnowAdapter: JobSourceAdapter = {
  source: JobSource.ARBEITNOW,
  minIntervalHours: 6,
  async fetchJobs(fetchFn = fetch) {
    const byId = new Map<string, NormalizedJob>();
    for (let page = 1; page <= SOURCES_CONFIG.arbeitnow.pages; page++) {
      const json = await getJson(
        "Arbeitnow",
        `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
        fetchFn,
      );
      for (const j of parseItems("Arbeitnow", json, "data", jobSchema)) {
        byId.set(j.slug, {
          source: JobSource.ARBEITNOW,
          externalId: j.slug,
          title: stripHtml(j.title),
          company: j.company_name.trim(),
          location: j.location.trim() || null,
          remote: j.remote,
          description: stripHtml(j.description),
          url: j.url,
          salaryMin: null,
          salaryMax: null,
          currency: null,
          // created_at is epoch seconds
          postedAt: j.created_at != null ? parseDate(j.created_at * 1000) : null,
        });
      }
    }
    return [...byId.values()];
  },
};
