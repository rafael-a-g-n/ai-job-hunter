import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JOBICY_COUNTRY_SLUGS,
  createJobicyAdapter,
  jobicyGeoFor,
} from "@/server/jobs/sources/jobicy";

type RawJob = Record<string, unknown> & { id: number; jobGeo: string };
const raw = JSON.parse(
  readFileSync(path.resolve(__dirname, "../fixtures/jobs/jobicy.json"), "utf8"),
) as { jobs: RawJob[] };

const byGeo = (geo: string) => raw.jobs.find((j) => j.jobGeo === geo)!;
const envelope = (jobs: unknown[], nextCursor: string | null = null) => ({
  jobs,
  nextCursor,
  hasMore: nextCursor !== null,
  success: true,
});
const asFetch = (f: unknown) => f as typeof fetch;
const adapter = (country = "Portugal", pages = 2) => createJobicyAdapter(country, pages, 0);

afterEach(() => vi.restoreAllMocks());

describe("Jobicy adapter", () => {
  it("has a 6 hour interval", () => {
    expect(adapter().minIntervalHours).toBe(6);
  });

  it("requests the candidate country's feed and follows the cursor for the second page", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(Response.json(envelope([raw.jobs[0]], "abc")))
      .mockResolvedValueOnce(Response.json(envelope([raw.jobs[1]])));
    await adapter().fetchJobs(asFetch(fetchFn));
    const urls = fetchFn.mock.calls.map(([u]) => new URL(String(u)));
    expect(urls).toHaveLength(2);
    expect(urls[0].origin + urls[0].pathname).toBe("https://jobicy.com/api/v2/remote-jobs");
    expect(urls[0].searchParams.get("geo")).toBe("portugal");
    expect(urls[0].searchParams.get("count")).toBe("100");
    expect(urls[0].searchParams.has("cursor")).toBe(false);
    expect(urls[1].searchParams.get("cursor")).toBe("abc");
    expect(urls[1].searchParams.get("geo")).toBe("portugal");
  });

  it("stops when there is no further page", async () => {
    const fetchFn = vi.fn(async () => Response.json(envelope([raw.jobs[0]])));
    await adapter("Portugal", 5).fetchJobs(asFetch(fetchFn));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps a fixture job", async () => {
    const job0 = byGeo("Europe");
    const fetchFn = vi.fn(async () => Response.json(envelope([job0])));
    const [job] = await adapter().fetchJobs(asFetch(fetchFn));
    expect(job).toMatchObject({
      source: "JOBICY",
      externalId: String(job0.id),
      title: job0.jobTitle,
      company: job0.companyName,
      location: null,
      remote: true,
      remoteScope: "Europe",
      url: job0.url,
      salaryMin: null,
      salaryMax: null,
      currency: null,
    });
    expect(job.postedAt).toEqual(new Date(job0.pubDate as string));
    expect(job.description).not.toMatch(/<[a-z]/i);
    expect(job.description.length).toBeGreaterThan(20);
  });

  it("keeps jobs open to Portugal and drops country-only ones", async () => {
    const fetchFn = vi.fn(async () => Response.json(envelope(raw.jobs)));
    const jobs = await adapter().fetchJobs(asFetch(fetchFn));
    expect(jobs.map((j) => j.remoteScope)).toEqual([
      "Europe",
      "EMEA",
      "Worldwide",
      "Portugal",
      "EMEA & Americas",
      "Several countries",
      "Europe & Americas",
    ]);
    expect(jobs.map((j) => j.externalId)).not.toContain(String(byGeo("Germany").id));
  });

  it("drops a country-only job for Portugal but keeps it for Germany", async () => {
    const de = byGeo("Germany");
    const f = () => vi.fn(async () => Response.json(envelope([de])));
    expect(await adapter("Portugal").fetchJobs(asFetch(f()))).toHaveLength(0);
    const jobs = await adapter("Germany").fetchJobs(asFetch(f()));
    expect(jobs.map((j) => j.remoteScope)).toEqual(["Germany"]);
  });

  it("labels a list that contains a region by the region, not as several countries", async () => {
    const base = byGeo("Europe");
    const fetchFn = vi.fn(async () =>
      Response.json(envelope([{ ...base, jobGeo: "EMEA,  LATAM,  Canada,  USA" }])),
    );
    const [job] = await adapter().fetchJobs(asFetch(fetchFn));
    expect(job.remoteScope).toBe("EMEA & Americas");
  });

  it("keeps the scope label out of location, so a label change does not change the dedupe hash", async () => {
    const fetchFn = vi.fn(async () => Response.json(envelope(raw.jobs)));
    const jobs = await adapter().fetchJobs(asFetch(fetchFn));
    expect(jobs.length).toBeGreaterThan(0);
    for (const j of jobs) expect(j.location).toBeNull();
  });

  it("builds the geo slug from the candidate's country", async () => {
    const geoFor = async (country: string) => {
      const fetchFn = vi.fn(async (url: string) => {
        void url;
        return Response.json(envelope([]));
      });
      await adapter(country).fetchJobs(asFetch(fetchFn));
      return new URL(String(fetchFn.mock.calls[0][0])).searchParams.get("geo");
    };
    expect(await geoFor("United Kingdom")).toBe("uk");
    expect(await geoFor("Czechia")).toBe("czechia");
    expect(await geoFor("Costa Rica")).toBe("costa-rica");
    // No slug: Europe's feed for a European country, Anywhere otherwise.
    expect(await geoFor("Albania")).toBe("europe");
    expect(await geoFor("Nigeria")).toBe("anywhere");
  });

  it("keeps annual salary only", async () => {
    const base = byGeo("Europe");
    const fetchFn = vi.fn(async () =>
      Response.json(
        envelope([
          {
            ...base,
            id: 1,
            salaryMin: 50000,
            salaryMax: 70000,
            salaryCurrency: "EUR",
            salaryPeriod: "yearly",
          },
          {
            ...base,
            id: 2,
            salaryMin: 20,
            salaryMax: 30,
            salaryCurrency: "EUR",
            salaryPeriod: "hourly",
          },
          {
            ...base,
            id: 3,
            salaryMin: 3000,
            salaryMax: 5000,
            salaryCurrency: "EUR",
            salaryPeriod: "monthly",
          },
          { ...base, id: 4, salaryMin: 40000, salaryMax: 60000, salaryCurrency: "EUR" },
        ]),
      ),
    );
    const jobs = await adapter().fetchJobs(asFetch(fetchFn));
    expect(jobs.map((j) => [j.salaryMin, j.salaryMax, j.currency])).toEqual([
      [50000, 70000, "EUR"],
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ]);
  });

  it("uses the original Jobicy URL and cleans HTML in the title", async () => {
    const base = byGeo("Europe");
    const fetchFn = vi.fn(async () =>
      Response.json(envelope([{ ...base, jobTitle: "Dev &amp; Ops <b>Lead</b>" }])),
    );
    const [job] = await adapter().fetchJobs(asFetch(fetchFn));
    expect(job.title).toBe("Dev & Ops Lead");
    expect(job.url).toBe(base.url);
  });

  it("dedupes by id across pages", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(Response.json(envelope([raw.jobs[0], raw.jobs[1]], "c")))
      .mockResolvedValueOnce(Response.json(envelope([raw.jobs[1]])));
    const jobs = await adapter().fetchJobs(asFetch(fetchFn));
    expect(jobs).toHaveLength(2);
  });

  it("skips malformed items", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchFn = vi.fn(async () =>
      Response.json(envelope([{ jobTitle: "no id or url" }, byGeo("Europe")])),
    );
    const jobs = await adapter().fetchJobs(asFetch(fetchFn));
    expect(jobs).toHaveLength(1);
  });

  it("names Jobicy when the first request fails", async () => {
    const fetchFn = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(adapter().fetchJobs(asFetch(fetchFn))).rejects.toThrow(
      /Jobicy request failed: 500/,
    );
  });

  it("keeps what it has when the second page is rate limited", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(Response.json(envelope([byGeo("Europe")], "c")))
      .mockResolvedValueOnce(new Response("slow", { status: 429 }));
    const jobs = await adapter().fetchJobs(asFetch(fetchFn));
    expect(jobs).toHaveLength(1);
  });

  it("rejects a response without a jobs array", async () => {
    const fetchFn = vi.fn(async () => Response.json({ nope: 1 }));
    await expect(adapter().fetchJobs(asFetch(fetchFn))).rejects.toThrow(/Jobicy response invalid/);
  });
});

describe("Jobicy country slugs", () => {
  const locations = (
    JSON.parse(
      readFileSync(path.resolve(__dirname, "../fixtures/jobs/jobicy-locations.json"), "utf8"),
    ) as { locations: { geoName: string; geoSlug: string }[] }
  ).locations;
  const regions = new Set(["anywhere", "apac", "emea", "latam", "europe"]);
  const countrySlugs = locations.map((l) => l.geoSlug).filter((s) => !regions.has(s));

  it("only uses slugs Jobicy lists", () => {
    const valid = new Set(locations.map((l) => l.geoSlug));
    for (const slug of Object.values(JOBICY_COUNTRY_SLUGS)) expect(valid).toContain(slug);
  });

  it("covers every country Jobicy lists", () => {
    expect(new Set(Object.values(JOBICY_COUNTRY_SLUGS))).toEqual(new Set(countrySlugs));
  });

  it("maps the standard English name of each to its slug", () => {
    expect(jobicyGeoFor("Portugal")).toBe("portugal");
    expect(jobicyGeoFor("Türkiye")).toBe("turkiye");
    expect(jobicyGeoFor("United States")).toBe("usa");
    expect(jobicyGeoFor("United Arab Emirates")).toBe("united-arab-emirates");
  });
});
