import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOURCES_CONFIG } from "@/server/jobs/sources/config";
import { createHimalayasAdapter } from "@/server/jobs/sources/himalayas";

type RawJob = Record<string, unknown> & { guid: string; locationRestrictions: string[] };
const raw = JSON.parse(
  readFileSync(path.resolve(__dirname, "../fixtures/jobs/himalayas.json"), "utf8"),
) as { jobs: RawJob[] };

const page = (jobs: unknown[]) => ({ comments: "", jobs });
const asFetch = (f: unknown) => f as typeof fetch;

/** Serves the given pages in order; later requests get an empty page. */
function pagedFetch(pages: unknown[][]) {
  let n = 0;
  return vi.fn(async (...args: [string | URL | Request]) => {
    void args;
    return Response.json(page(pages[n++] ?? []));
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Himalayas adapter", () => {
  it("has a 6 hour interval", () => {
    expect(createHimalayasAdapter("Portugal").minIntervalHours).toBe(6);
  });

  it("requests the search endpoint for the candidate's country, page by page", async () => {
    const full = Array.from({ length: 20 }, (_, i) => ({ ...raw.jobs[0], guid: `g${i}` }));
    const fetchFn = pagedFetch([full, full, []]);
    await createHimalayasAdapter("Portugal", 5).fetchJobs(asFetch(fetchFn));
    const urls = fetchFn.mock.calls.map(([u]) => new URL(String(u)));
    expect(urls.map((u) => u.searchParams.get("page"))).toEqual(["1", "2", "3"]);
    for (const u of urls) {
      expect(u.origin + u.pathname).toBe("https://himalayas.app/jobs/api/search");
      expect(u.searchParams.get("country")).toBe("Portugal");
    }
  });

  it("stops at the configured number of pages", async () => {
    const full = Array.from({ length: 20 }, (_, i) => ({ ...raw.jobs[0], guid: `g${i}` }));
    const fetchFn = pagedFetch([full, full, full, full]);
    await createHimalayasAdapter("Portugal", 2).fetchJobs(asFetch(fetchFn));
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("defaults to the configured page count (at most ~200 jobs per run)", () => {
    expect(SOURCES_CONFIG.himalayas.pages * 20).toBeLessThanOrEqual(200);
  });

  it("maps a fixture job", async () => {
    const fetchFn = pagedFetch([raw.jobs.slice(0, 1)]);
    const [job] = await createHimalayasAdapter("Portugal").fetchJobs(asFetch(fetchFn));
    expect(job).toMatchObject({
      source: "HIMALAYAS",
      externalId: raw.jobs[0].guid,
      title: "Market Specialist",
      company: "HILLSIDE ASSETS LIMITED",
      remote: true,
      remoteScope: "Worldwide",
      location: null,
      url: raw.jobs[0].applicationLink,
      salaryMin: 40000,
      salaryMax: 50000,
      currency: "USD",
    });
    expect(job.postedAt).toEqual(new Date((raw.jobs[0].pubDate as number) * 1000));
    expect(job.description).not.toMatch(/<[a-z]/i);
    expect(job.description.length).toBeGreaterThan(20);
  });

  it("labels fixture jobs by their restrictions", async () => {
    const fetchFn = pagedFetch([raw.jobs]);
    const jobs = await createHimalayasAdapter("Portugal").fetchJobs(asFetch(fetchFn));
    expect(jobs.map((j) => j.remoteScope)).toEqual([
      "Worldwide",
      "Europe & more",
      "Europe & more",
      "Portugal",
      "Europe",
    ]);
  });

  it("keeps the scope label out of location, so a label change does not change the dedupe hash", async () => {
    const fetchFn = pagedFetch([raw.jobs]);
    const jobs = await createHimalayasAdapter("Portugal").fetchJobs(asFetch(fetchFn));
    for (const j of jobs) expect(j.location).toBeNull();
  });

  it("carries the source's own expiry date, when it has one", async () => {
    const withExpiry = { ...raw.jobs[0], guid: "e", expiryDate: 1800000000 };
    const { expiryDate, ...without } = { ...raw.jobs[0], guid: "n" } as Record<string, unknown>;
    void expiryDate;
    const fetchFn = pagedFetch([[withExpiry, without]]);
    const jobs = await createHimalayasAdapter("Portugal").fetchJobs(asFetch(fetchFn));
    expect(jobs[0].expiresAt).toEqual(new Date(1800000000 * 1000));
    expect(jobs[1].expiresAt).toBeNull();
  });

  it("keeps salary only for annual periods", async () => {
    const base = raw.jobs[0];
    const fetchFn = pagedFetch([
      [
        { ...base, guid: "a", salaryPeriod: "monthly", minSalary: 3000, maxSalary: 6000 },
        { ...base, guid: "b", salaryPeriod: "hourly", minSalary: 20, maxSalary: 30 },
        { ...base, guid: "c", minSalary: null, maxSalary: null, currency: null },
        { ...base, guid: "d", minSalary: 40000, maxSalary: null },
      ],
    ]);
    const jobs = await createHimalayasAdapter("Portugal").fetchJobs(asFetch(fetchFn));
    expect(jobs.map((j) => [j.salaryMin, j.salaryMax, j.currency])).toEqual([
      [null, null, null],
      [null, null, null],
      [null, null, null],
      [40000, null, "USD"],
    ]);
  });

  it("drops jobs restricted to countries that do not include the candidate's", async () => {
    const base = raw.jobs[0];
    const fetchFn = pagedFetch([
      [
        { ...base, guid: "es", locationRestrictions: ["Spain", "France"] },
        { ...base, guid: "pt", locationRestrictions: ["portugal"] },
      ],
    ]);
    const jobs = await createHimalayasAdapter("Portugal").fetchJobs(asFetch(fetchFn));
    expect(jobs.map((j) => j.externalId)).toEqual(["pt"]);
  });

  it("dedupes by id across pages", async () => {
    const fetchFn = pagedFetch([raw.jobs.slice(0, 2), raw.jobs.slice(1, 3)]);
    const jobs = await createHimalayasAdapter("Portugal", 2).fetchJobs(asFetch(fetchFn));
    expect(jobs.map((j) => j.externalId)).toEqual(raw.jobs.slice(0, 3).map((j) => j.guid));
  });

  it("falls back to the posting address when there is no application link", async () => {
    const { applicationLink, ...noLink } = raw.jobs[0];
    void applicationLink;
    const fetchFn = pagedFetch([[noLink]]);
    const [job] = await createHimalayasAdapter("Portugal").fetchJobs(asFetch(fetchFn));
    expect(job.url).toBe(raw.jobs[0].guid);
  });

  it("skips malformed items", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchFn = pagedFetch([[{ title: "no company or id" }, raw.jobs[3]]]);
    const jobs = await createHimalayasAdapter("Portugal").fetchJobs(asFetch(fetchFn));
    expect(jobs).toHaveLength(1);
  });

  it("names Himalayas when the first page fails", async () => {
    const fetchFn = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(createHimalayasAdapter("Portugal").fetchJobs(asFetch(fetchFn))).rejects.toThrow(
      /Himalayas request failed: 500/,
    );
  });

  it("keeps what it has when a later page is rate limited", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const full = Array.from({ length: 20 }, (_, i) => ({ ...raw.jobs[0], guid: `g${i}` }));
    let n = 0;
    const fetchFn = vi.fn(async () =>
      n++ === 0 ? Response.json(page(full)) : new Response("slow down", { status: 429 }),
    );
    const jobs = await createHimalayasAdapter("Portugal", 3).fetchJobs(asFetch(fetchFn));
    expect(jobs).toHaveLength(20);
  });

  it("rejects a response without a jobs array", async () => {
    const fetchFn = vi.fn(async () => Response.json({ nope: 1 }));
    await expect(createHimalayasAdapter("Portugal").fetchJobs(asFetch(fetchFn))).rejects.toThrow(
      /Himalayas response invalid/,
    );
  });
});
