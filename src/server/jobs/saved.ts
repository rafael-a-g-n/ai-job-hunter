import { db } from "@/lib/db";
import { getJob, jobListSelect, visibleJobWhere, type JobListItem } from "./search";

/** Flips the saved state. A job the user cannot see is `NotFoundError`. */
export async function toggleSavedJob(userId: string, jobId: string): Promise<{ saved: boolean }> {
  await getJob(userId, jobId);
  const removed = await db.savedJob.deleteMany({ where: { userId, jobId } });
  if (removed.count > 0) return { saved: false };
  await db.savedJob.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: { userId, jobId },
    update: {},
  });
  return { saved: true };
}

export async function isJobSaved(userId: string, jobId: string): Promise<boolean> {
  return (await db.savedJob.findUnique({ where: { userId_jobId: { userId, jobId } } })) !== null;
}

/** The user's saved jobs, newest save first; jobs no longer visible are left out. */
export async function listSavedJobs(userId: string): Promise<JobListItem[]> {
  const rows = await db.savedJob.findMany({
    where: { userId, job: visibleJobWhere(userId) },
    orderBy: { createdAt: "desc" },
    select: { job: { select: jobListSelect } },
  });
  return rows.map((r) => r.job);
}

/** Which of the given job ids the user has saved. */
export async function savedJobIds(userId: string, jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const rows = await db.savedJob.findMany({
    where: { userId, jobId: { in: jobIds } },
    select: { jobId: true },
  });
  return new Set(rows.map((r) => r.jobId));
}
