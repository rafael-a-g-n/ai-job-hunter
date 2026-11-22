import type { JobSource } from "@/generated/prisma/client";

export type NormalizedJob = {
  source: JobSource;
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  /** Where the candidate may work from ("Worldwide", "Europe", "Portugal"...); null if unknown. */
  remoteScope: string | null;
  /** Plain text, HTML stripped. */
  description: string;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  postedAt: Date | null;
  /** The source's own closing date, when it gives one; the 30 day rule still caps it. */
  expiresAt?: Date | null;
};

export interface JobSourceAdapter {
  source: JobSource;
  minIntervalHours: number;
  fetchJobs(fetchFn?: typeof fetch): Promise<NormalizedJob[]>;
}
