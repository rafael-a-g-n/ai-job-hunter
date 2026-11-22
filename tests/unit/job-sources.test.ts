import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdzunaAdapter } from "@/server/jobs/sources/adzuna";
import { arbeitnowAdapter } from "@/server/jobs/sources/arbeitnow";
import { SOURCES_CONFIG } from "@/server/jobs/sources/config";
import { createRemotiveAdapter } from "@/server/jobs/sources/remotive";
import { computeDedupeHash, getJson, htmlToText, stripHtml } from "@/server/jobs/sources/util";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(path.resolve(__dirname, "../fixtures/jobs", `${name}.json`), "utf8"),
  );
}

const remotiveAdapter = createRemotiveAdapter("Portugal");

function stubFetch(body: unknown) {
  return vi.fn(async (...args: [string | URL | Request]) => (void args, Response.json(body)));
}

const asFetch = (f: ReturnType<typeof stubFetch>) => f as unknown as typeof fetch;

describe("stripHtml", () => {
  it("removes tags, decodes entities and collapses whitespace", () => {
    expect(
      stripHtml(
        "<p>Hello&nbsp;<strong>world</strong> &amp; co</p>\n\n<ul><li>a</li><li>b</li></ul>",
      ),
    ).toBe("Hello world & co a b");
  });

  it("handles double-escaped markup", () => {
    expect(
      stripHtml("&lt;h3&gt;&lt;strong&gt;About&lt;/strong&gt;&lt;/h3&gt; &amp;amp; more"),
    ).toBe("About & more");
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs, line breaks and list items", () => {
    expect(
      htmlToText(
        "<h3>About</h3><p>Hello&nbsp;<strong>world</strong> &amp; co.<br>Second   line</p>" +
          "<p>What you get:</p><ul><li>Remote</li><li>Flexible  hours</li></ul><p>Apply now</p>",
      ),
    ).toBe(
      "About\n\nHello world & co.\nSecond line\n\nWhat you get:\n\n• Remote\n• Flexible hours\n\nApply now",
    );
  });

  it("keeps list items whole when they wrap their text in paragraphs", () => {
    expect(
      htmlToText("<p>Skills</p><ul><li><p>Ruby</p></li><li><p>Rails 8</p></li></ul><p>End</p>"),
    ).toBe("Skills\n\n• Ruby\n• Rails 8\n\nEnd");
  });

  it("handles double-escaped markup", () => {
    expect(htmlToText("&lt;p&gt;One&lt;/p&gt;&lt;p&gt;Two &amp;amp; three&lt;/p&gt;")).toBe(
      "One\n\nTwo & three",
    );
  });

  it("collapses runs of blank lines and trims every line", () => {
    expect(htmlToText("  <div>\n\n\n  a  </div>\r\n\r\n\r\n<div>\tb</div>  ")).toBe("a\n\nb");
  });

  it("leaves plain text unchanged apart from whitespace", () => {
    expect(htmlToText("Plain  text\nwith a break")).toBe("Plain text\nwith a break");
  });
});

describe("computeDedupeHash", () => {
  it("ignores case and repeated whitespace", () => {
    expect(computeDedupeHash({ title: "Senior  Dev", company: "ACME", location: "Lisbon" })).toBe(
      computeDedupeHash({ title: "senior dev", company: "acme", location: "lisbon" }),
    );
  });

  it("differs when a field differs", () => {
    expect(computeDedupeHash({ title: "Dev", company: "A", location: null })).not.toBe(
      computeDedupeHash({ title: "Dev", company: "B", location: null }),
    );
  });
});

describe("Adzuna adapter", () => {
  const adapter = createAdzunaAdapter({ appId: "id123", appKey: "key456" });

  it("has the configured interval", () => {
    expect(adapter.minIntervalHours).toBe(6);
  });

  it("searches Spain when no countries are given", async () => {
    const fetchFn = stubFetch({ results: [] });
    await adapter.fetchJobs(asFetch(fetchFn));
    const paths = fetchFn.mock.calls.map(([u]) => new URL(String(u)).pathname);
    expect(paths.every((p) => p.startsWith("/v1/api/jobs/es/"))).toBe(true);
  });

  it("requests every configured country, query and page with the right URL", async () => {
    const countries = ["es", "gb"] as const;
    const fetchFn = stubFetch({ results: [] });
    await createAdzunaAdapter({ appId: "id123", appKey: "key456" }, countries).fetchJobs(
      asFetch(fetchFn),
    );
    const { queries, pages, resultsPerPage } = SOURCES_CONFIG.adzuna;
    expect(fetchFn).toHaveBeenCalledTimes(countries.length * queries.length * pages);
    const urls = fetchFn.mock.calls.map(([u]) => new URL(String(u)));
    for (const country of countries) {
      for (const query of queries) {
        for (let page = 1; page <= pages; page++) {
          const match = urls.find(
            (u) =>
              u.pathname === `/v1/api/jobs/${country}/search/${page}` &&
              u.searchParams.get("what") === query,
          );
          expect(match, `${country} ${query} p${page}`).toBeDefined();
          expect(match?.origin).toBe("https://api.adzuna.com");
          expect(match?.searchParams.get("app_id")).toBe("id123");
          expect(match?.searchParams.get("app_key")).toBe("key456");
          expect(match?.searchParams.get("results_per_page")).toBe(String(resultsPerPage));
        }
      }
    }
  });

  it("maps fields and strips HTML", async () => {
    const jobs = await adapter.fetchJobs(asFetch(stubFetch(fixture("adzuna"))));
    // same fixture returned for every request: deduped by external id
    expect(jobs).toHaveLength(3);
    const [first, second, third] = jobs;
    expect(first).toMatchObject({
      source: "ADZUNA",
      externalId: "4912345678",
      title: "Senior Developer (React)",
      company: "Acme Software",
      location: "Lisboa, Lisboa",
      remote: false,
      url: "https://www.adzuna.pt/land/ad/4912345678?se=abc&v=123",
      salaryMin: 30000,
      salaryMax: 45000,
      currency: "EUR",
    });
    expect(first.description).toBe(
      "Join our Lisbon team as a developer building web apps with React & TypeScript. Hybrid work...",
    );
    expect(first.postedAt).toEqual(new Date("2026-11-18T09:30:00Z"));
    expect(jobs.every((j) => j.remoteScope === null)).toBe(true);
    expect(second.remote).toBe(true);
    expect(second.salaryMin).toBeNull();
    expect(second.currency).toBeNull();
    expect(third).toMatchObject({ company: "Unknown company", location: null, postedAt: null });
  });

  it("throws an error carrying the status on non-2xx", async () => {
    const fetchFn = vi.fn(async () => new Response("slow down", { status: 429 }));
    await expect(adapter.fetchJobs(asFetch(fetchFn as never))).rejects.toThrow(
      "Adzuna request failed: 429",
    );
  });
});

describe("Arbeitnow adapter", () => {
  it("has the configured interval", () => {
    expect(arbeitnowAdapter.minIntervalHours).toBe(6);
  });

  it("requests each page", async () => {
    const fetchFn = stubFetch({ data: [] });
    await arbeitnowAdapter.fetchJobs(asFetch(fetchFn));
    expect(fetchFn.mock.calls.map(([u]) => String(u))).toEqual(
      Array.from(
        { length: SOURCES_CONFIG.arbeitnow.pages },
        (_, i) => `https://www.arbeitnow.com/api/job-board-api?page=${i + 1}`,
      ),
    );
  });

  it("maps fields and strips (double-escaped) HTML", async () => {
    const raw = fixture("arbeitnow") as {
      data: {
        slug: string;
        title: string;
        company_name: string;
        url: string;
        remote: boolean;
        created_at: number;
      }[];
    };
    const jobs = await arbeitnowAdapter.fetchJobs(asFetch(stubFetch(raw)));
    expect(jobs).toHaveLength(raw.data.length);
    const first = jobs[0];
    const src = raw.data[0];
    expect(first).toMatchObject({
      source: "ARBEITNOW",
      externalId: src.slug,
      title: src.title,
      company: src.company_name,
      remote: src.remote,
      url: src.url,
    });
    expect(first.postedAt).toEqual(new Date(src.created_at * 1000));
    for (const j of jobs) {
      expect(j.description).not.toMatch(/<[a-z/][^>]*>/i);
      expect(j.description).not.toMatch(/&(lt|gt|amp|nbsp);/);
      expect(j.description.length).toBeGreaterThan(0);
    }
  });

  it("throws an error carrying the status on non-2xx", async () => {
    const fetchFn = vi.fn(async () => new Response("", { status: 503 }));
    await expect(arbeitnowAdapter.fetchJobs(asFetch(fetchFn as never))).rejects.toThrow(
      "Arbeitnow request failed: 503",
    );
  });
});

describe("Remotive adapter", () => {
  it("has the configured interval", () => {
    expect(remotiveAdapter.minIntervalHours).toBe(24);
  });

  it("makes one request with the limit param", async () => {
    const fetchFn = stubFetch({ jobs: [] });
    await remotiveAdapter.fetchJobs(asFetch(fetchFn));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toBe("https://remotive.com/api/remote-jobs?limit=300");
  });

  it("keeps only jobs a candidate in Portugal can do, and maps them", async () => {
    const raw = fixture("remotive") as {
      jobs: {
        id: number;
        title: string;
        company_name: string;
        url: string;
        publication_date: string;
        candidate_required_location: string;
      }[];
    };
    const jobs = await remotiveAdapter.fetchJobs(asFetch(stubFetch(raw)));
    // fixture locations: USA, USA/Canada (x2), Worldwide, "LATAM, Europe, USA, Canada, APAC"
    expect(jobs.map((j) => j.externalId)).toEqual(["1680495", "2091137"]);
    expect(jobs.map((j) => j.remoteScope)).toEqual(["Worldwide", "Europe"]);
    const src = raw.jobs.find((j) => String(j.id) === jobs[0].externalId)!;
    expect(jobs[0]).toMatchObject({
      source: "REMOTIVE",
      externalId: String(src.id),
      title: src.title,
      company: src.company_name.trim(),
      location: src.candidate_required_location,
      remote: true,
      url: src.url,
    });
    expect(jobs[0].postedAt).toEqual(new Date(`${src.publication_date}Z`));
    for (const j of jobs) {
      expect(j.description).not.toMatch(/<[a-z/][^>]*>/i);
      expect(j.description.length).toBeGreaterThan(0);
    }
  });

  it("filters by the candidate's country", async () => {
    const raw = fixture("remotive");
    const usa = await createRemotiveAdapter("United States").fetchJobs(asFetch(stubFetch(raw)));
    expect(usa).toHaveLength(5);
    const brazil = await createRemotiveAdapter("Brazil").fetchJobs(asFetch(stubFetch(raw)));
    expect(brazil.map((j) => j.externalId)).toEqual(["1680495"]);
  });

  it("keeps every job when no candidate country is given (recorded fixtures)", async () => {
    const raw = fixture("remotive") as { jobs: unknown[] };
    const jobs = await createRemotiveAdapter(null).fetchJobs(asFetch(stubFetch(raw)));
    expect(jobs).toHaveLength(raw.jobs.length);
  });

  it("throws an error carrying the status on non-2xx", async () => {
    const fetchFn = vi.fn(async () => new Response("", { status: 429 }));
    await expect(remotiveAdapter.fetchJobs(asFetch(fetchFn as never))).rejects.toThrow(
      "Remotive request failed: 429",
    );
  });
});

describe("getEnabledAdapters", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function enabled(vars: Record<string, string> = {}) {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32));
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("EMBEDDINGS_PROVIDER", "fake");
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("MAIL_PROVIDER", "console");
    vi.stubEnv("EMAIL_FROM", "x@example.com");
    vi.stubEnv("CRON_SECRET", "x");
    vi.stubEnv("ADZUNA_APP_ID", "");
    vi.stubEnv("ADZUNA_APP_KEY", "");
    vi.stubEnv("JOB_SOURCES", "");
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
    const { getEnabledAdapters } = await import("@/server/jobs/sources");
    return getEnabledAdapters().map((a) => a.source);
  }

  it("enables Himalayas and Remotive by default until Jobicy exists", async () => {
    expect(await enabled()).toEqual(["HIMALAYAS", "REMOTIVE"]);
  });

  it("follows JOB_SOURCES, in that order", async () => {
    expect(await enabled({ JOB_SOURCES: "arbeitnow,remotive" })).toEqual(["ARBEITNOW", "REMOTIVE"]);
    expect(await enabled({ JOB_SOURCES: "arbeitnow" })).toEqual(["ARBEITNOW"]);
  });

  it("omits Adzuna without both keys", async () => {
    expect(await enabled({ JOB_SOURCES: "adzuna" })).toEqual([]);
    expect(await enabled({ JOB_SOURCES: "adzuna", ADZUNA_APP_ID: "only-id" })).toEqual([]);
  });

  it("includes Adzuna when it is listed and both keys are set", async () => {
    expect(
      await enabled({ JOB_SOURCES: "adzuna,remotive", ADZUNA_APP_ID: "a", ADZUNA_APP_KEY: "b" }),
    ).toEqual(["ADZUNA", "REMOTIVE"]);
  });

  it("does not enable Adzuna just because its keys are set", async () => {
    expect(await enabled({ ADZUNA_APP_ID: "a", ADZUNA_APP_KEY: "b" })).toEqual([
      "HIMALAYAS",
      "REMOTIVE",
    ]);
  });
});

describe("malformed data and timeouts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("skips one broken Remotive item and maps the rest", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = fixture("remotive") as { jobs: Record<string, unknown>[] };
    // job 4 is the "Worldwide" one; one of the two eligible jobs is broken
    const broken = {
      ...raw,
      jobs: raw.jobs.map((j, i) => (i === 3 ? { ...j, title: undefined } : j)),
    };
    const jobs = await remotiveAdapter.fetchJobs(asFetch(stubFetch(broken)));
    expect(jobs.map((j) => j.externalId)).toEqual(["2091137"]);
    expect(warn).toHaveBeenCalledWith("Remotive: skipped 1 malformed jobs");
  });

  it("skips one broken Arbeitnow item", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = fixture("arbeitnow") as { data: Record<string, unknown>[] };
    const broken = { ...raw, data: [{ ...raw.data[0], slug: 5 }, ...raw.data.slice(1)] };
    const jobs = await arbeitnowAdapter.fetchJobs(asFetch(stubFetch(broken)));
    // same page returned for every request, deduped by slug
    expect(jobs).toHaveLength(raw.data.length - 1);
  });

  it("skips one broken Adzuna item", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = fixture("adzuna") as { results: Record<string, unknown>[] };
    const broken = {
      ...raw,
      results: [{ ...raw.results[0], redirect_url: undefined }, ...raw.results.slice(1)],
    };
    const jobs = await createAdzunaAdapter({ appId: "a", appKey: "b" }).fetchJobs(
      asFetch(stubFetch(broken)),
    );
    expect(jobs.map((j) => j.externalId)).toEqual(["4912345679", "4912345680"]);
  });

  it.each([
    ["Remotive", () => remotiveAdapter.fetchJobs(asFetch(stubFetch({ nope: 1 })))],
    ["Arbeitnow", () => arbeitnowAdapter.fetchJobs(asFetch(stubFetch({ data: "x" })))],
    [
      "Adzuna",
      () => createAdzunaAdapter({ appId: "a", appKey: "b" }).fetchJobs(asFetch(stubFetch(null))),
    ],
  ])("throws naming %s on an invalid envelope", async (name, run) => {
    await expect(run()).rejects.toThrow(`${name} response invalid`);
  });

  it("times out a hung request and names the source", async () => {
    const hang = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    await expect(getJson("Remotive", "https://x.test", hang as never, 20)).rejects.toThrow(
      "Remotive request failed: timeout",
    );
  });
});
