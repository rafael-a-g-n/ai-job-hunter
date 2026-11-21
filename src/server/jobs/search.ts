import type { Job, JobSource, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

export type JobListItem = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  source: JobSource;
  postedAt: Date | null;
  url: string | null;
};

export type JobSearchQuery = {
  text?: string;
  location?: string;
  remote?: boolean;
  source?: JobSource;
  /** 1-based */
  page?: number;
  /** default 20, max 50 */
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/** A job is visible iff it has not expired and is public or owned by the user. */
export function visibleJobWhere(userId: string, now = new Date()): Prisma.JobWhereInput {
  return { expiresAt: { gt: now }, OR: [{ ownerId: null }, { ownerId: userId }] };
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export const jobListSelect = {
  id: true,
  title: true,
  company: true,
  location: true,
  remote: true,
  source: true,
  postedAt: true,
  url: true,
} satisfies Prisma.JobSelect;

export async function searchJobs(
  userId: string,
  q: JobSearchQuery = {},
): Promise<{ items: JobListItem[]; total: number; page: number; pageSize: number }> {
  const pageSize = clampInt(q.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const page = clampInt(q.page, 1, 1, 1_000_000);
  const text = q.text?.trim() && escapeLike(q.text.trim());
  const location = q.location?.trim() && escapeLike(q.location.trim());

  const and: Prisma.JobWhereInput[] = [visibleJobWhere(userId)];
  if (text) {
    // Prisma does not escape LIKE wildcards in `contains`, so escape them: input matches literally.
    and.push({
      OR: [
        { title: { contains: text, mode: "insensitive" } },
        { company: { contains: text, mode: "insensitive" } },
        { description: { contains: text, mode: "insensitive" } },
      ],
    });
  }
  if (location) and.push({ location: { contains: location, mode: "insensitive" } });
  if (q.remote) and.push({ remote: true });
  if (q.source) and.push({ source: q.source });
  const where: Prisma.JobWhereInput = { AND: and };

  const [items, total] = await Promise.all([
    db.job.findMany({
      where,
      select: jobListSelect,
      orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.job.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getJob(userId: string, jobId: string): Promise<Job> {
  const job = await db.job.findFirst({ where: { id: jobId, ...visibleJobWhere(userId) } });
  if (!job) throw new NotFoundError("Job");
  return job;
}
