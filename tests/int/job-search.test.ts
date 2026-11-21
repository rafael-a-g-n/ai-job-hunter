import { beforeEach, describe, expect, it } from "vitest";
import type { JobSource } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { isJobSaved, listSavedJobs, savedJobIds, toggleSavedJob } from "@/server/jobs/saved";
import { getJob, searchJobs } from "@/server/jobs/search";

const A = "job-user-a";
const B = "job-user-b";
const DAY = 86_400_000;

let n = 0;
async function makeJob(
  over: Partial<{
    title: string;
    company: string;
    description: string;
    location: string | null;
    remote: boolean;
    source: JobSource;
    postedAt: Date | null;
    ownerId: string | null;
    expiresAt: Date;
  }> = {},
) {
  n += 1;
  return db.job.create({
    data: {
      source: "ARBEITNOW",
      dedupeHash: `hash-${n}`,
      title: `Job ${n}`,
      company: "Acme",
      description: "Generic description",
      expiresAt: new Date(Date.now() + 30 * DAY),
      ...over,
    },
  });
}

beforeEach(async () => {
  for (const id of [A, B]) {
    await db.user.create({ data: { id, name: id, email: `${id}@example.com` } });
  }
});

describe("searchJobs", () => {
  it("matches text in title, company and description, case-insensitively", async () => {
    await makeJob({ description: "We build things with React and Node" });
    await makeJob({ title: "React Engineer" });
    await makeJob({ company: "Reactive Labs" });
    await makeJob({ description: "Java only" });
    const r = await searchJobs(A, { text: "react" });
    expect(r.total).toBe(3);
    expect(r.items).toHaveLength(3);
  });

  it("matches LIKE wildcards literally", async () => {
    await makeJob({ title: "100% remote friendly" });
    await makeJob({ title: "Plain title" });
    expect((await searchJobs(A, { text: "%" })).total).toBe(1);
    expect((await searchJobs(A, { text: "_" })).total).toBe(0);
  });

  it("filters by remote, location and source", async () => {
    await makeJob({ remote: true, location: "Lisbon", source: "REMOTIVE" });
    await makeJob({ remote: false, location: "Porto" });
    expect((await searchJobs(A, { remote: true })).total).toBe(1);
    expect((await searchJobs(A, { location: "porto" })).total).toBe(1);
    expect((await searchJobs(A, { source: "REMOTIVE" })).total).toBe(1);
    expect((await searchJobs(A, {})).total).toBe(2);
  });

  it("paginates with correct totals and clamps pageSize to 50", async () => {
    for (let i = 0; i < 25; i++) await makeJob();
    const p1 = await searchJobs(A, { pageSize: 10, page: 1 });
    const p3 = await searchJobs(A, { pageSize: 10, page: 3 });
    expect(p1).toMatchObject({ total: 25, page: 1, pageSize: 10 });
    expect(p1.items).toHaveLength(10);
    expect(p3.items).toHaveLength(5);
    expect((await searchJobs(A, { pageSize: 500 })).pageSize).toBe(50);
    expect((await searchJobs(A, {})).pageSize).toBe(20);
  });

  it("sorts by postedAt desc with nulls last", async () => {
    const old = await makeJob({ postedAt: new Date(Date.now() - 5 * DAY) });
    const none = await makeJob({ postedAt: null });
    const fresh = await makeJob({ postedAt: new Date(Date.now() - DAY) });
    const r = await searchJobs(A, {});
    expect(r.items.map((i) => i.id)).toEqual([fresh.id, old.id, none.id]);
  });

  it("hides expired jobs", async () => {
    await makeJob({ expiresAt: new Date(Date.now() - 1000) });
    expect((await searchJobs(A, {})).total).toBe(0);
  });

  it("never returns another user's manual job (IDOR)", async () => {
    const mine = await makeJob({ source: "MANUAL", ownerId: A, title: "A private" });
    await makeJob({ title: "Public" });
    const asA = await searchJobs(A, {});
    const asB = await searchJobs(B, {});
    expect(asA.items.map((i) => i.id)).toContain(mine.id);
    expect(asB.total).toBe(1);
    expect(asB.items.map((i) => i.id)).not.toContain(mine.id);
    expect((await searchJobs(B, { text: "private" })).total).toBe(0);
  });
});

describe("getJob", () => {
  it("returns public jobs and the owner's manual job", async () => {
    const pub = await makeJob();
    const mine = await makeJob({ source: "MANUAL", ownerId: A });
    expect((await getJob(B, pub.id)).id).toBe(pub.id);
    expect((await getJob(A, mine.id)).id).toBe(mine.id);
  });

  it("throws NotFoundError for another user's manual job and for unknown ids", async () => {
    const mine = await makeJob({ source: "MANUAL", ownerId: A });
    await expect(getJob(B, mine.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJob(A, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("saved jobs", () => {
  it("toggles saved state and lists saved jobs", async () => {
    const job = await makeJob();
    expect(await toggleSavedJob(A, job.id)).toEqual({ saved: true });
    expect(await isJobSaved(A, job.id)).toBe(true);
    expect((await listSavedJobs(A)).map((j) => j.id)).toEqual([job.id]);
    expect(await listSavedJobs(B)).toEqual([]);
    expect(await savedJobIds(A, [job.id, "x"])).toEqual(new Set([job.id]));
    expect(await toggleSavedJob(A, job.id)).toEqual({ saved: false });
    expect(await listSavedJobs(A)).toEqual([]);
  });

  it("refuses to save a job the user cannot see", async () => {
    const theirs = await makeJob({ source: "MANUAL", ownerId: A });
    await expect(toggleSavedJob(B, theirs.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.savedJob.count()).toBe(0);
  });
});
