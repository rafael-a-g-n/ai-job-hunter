import type { JobSource } from "@/generated/prisma/client";

export type NormalizedJob = {
  source: JobSource;
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  /** Plain text, HTML stripped. */
  description: string;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  postedAt: Date | null;
};

export interface JobSourceAdapter {
  source: JobSource;
  minIntervalHours: number;
  fetchJobs(fetchFn?: typeof fetch): Promise<NormalizedJob[]>;
}
