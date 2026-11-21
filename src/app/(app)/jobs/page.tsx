import Link from "next/link";
import { Suspense } from "react";
import { JobCard } from "@/components/jobs/job-card";
import { JOB_SOURCES, JobFilters } from "@/components/jobs/job-filters";
import { Pagination } from "@/components/jobs/pagination";
import { EmptyState } from "@/components/app/empty-state";
import { requireUser } from "@/server/auth/session";
import { savedJobIds } from "@/server/jobs/saved";
import { searchJobs } from "@/server/jobs/search";
import { PageSkeleton } from "@/components/app/page-skeleton";

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

async function Results({ searchParams }: { searchParams: Promise<Params> }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  const q = first(sp.q).trim().slice(0, 200);
  const location = first(sp.location).trim().slice(0, 200);
  const remote = first(sp.remote) === "1";
  const sourceParam = first(sp.source);
  const source = JOB_SOURCES.find((s) => s === sourceParam);
  const pageNumber = Number.parseInt(first(sp.page), 10);

  const result = await searchJobs(user.id, {
    text: q || undefined,
    location: location || undefined,
    remote: remote || undefined,
    source,
    page: Number.isNaN(pageNumber) ? 1 : pageNumber,
  });
  const saved = await savedJobIds(
    user.id,
    result.items.map((j) => j.id),
  );
  const now = new Date();

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (location) params.set("location", location);
  if (remote) params.set("remote", "1");
  if (source) params.set("source", source);

  return (
    <>
      <JobFilters q={q} location={location} remote={remote} source={source ?? ""} />
      <p className="text-sm text-muted-foreground">
        {result.total} {result.total === 1 ? "job" : "jobs"} found
      </p>
      {result.items.length === 0 ? (
        <EmptyState>No jobs match these filters.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {result.items.map((job) => (
            <li key={job.id}>
              <JobCard job={job} saved={saved.has(job.id)} now={now} />
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        params={params}
      />
    </>
  );
}

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/jobs/matches" className="underline underline-offset-4">
            Best matches
          </Link>
          <Link href="/jobs/new" className="underline underline-offset-4">
            Paste a job
          </Link>
        </div>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
