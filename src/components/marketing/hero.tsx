import Link from "next/link";
import { ScoreRing } from "@/components/cv/score-ring";
import { DemoButton } from "@/components/demo/DemoButton";
import { buttonVariants } from "@/components/ui/button";

const MATCHED = ["TypeScript", "React", "PostgreSQL", "Testing"];
const MISSING = ["GraphQL"];

/** A static sample of the product's core output: a job scored against a CV. */
function SampleMatch() {
  return (
    <figure className="mx-auto w-full max-w-md" aria-label="Example job match">
      <div className="rounded-2xl border bg-card p-6 shadow-[0_24px_60px_-30px] shadow-primary/40">
        <div className="flex items-center gap-5">
          <ScoreRing score={87} size={96} />
          <div>
            <p className="font-heading text-lg leading-tight font-semibold">
              Senior Frontend Engineer
            </p>
            <p className="text-sm text-muted-foreground">Northwind Labs, remote (EU)</p>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 text-sm">
          <div>
            <dt className="mb-1.5 font-medium">Your CV covers</dt>
            <dd className="flex flex-wrap gap-1.5">
              {MATCHED.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-accent px-2.5 py-0.5 text-accent-foreground"
                >
                  {s}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="mb-1.5 font-medium">Worth adding</dt>
            <dd className="flex flex-wrap gap-1.5">
              {MISSING.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-dashed px-2.5 py-0.5 text-muted-foreground"
                >
                  {s}
                </span>
              ))}
            </dd>
          </div>
        </dl>
        <p className="mt-6 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          &ldquo;Your four years of React and TypeScript line up with the core of this role.&rdquo;
        </p>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        Example output, not a real job.
      </figcaption>
    </figure>
  );
}

export function Hero() {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
      <div>
        <h1 className="text-4xl leading-[1.05] font-semibold text-balance sm:text-6xl">
          Know where your CV stands, then apply to jobs that fit.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Upload your CV for a scored review, get open roles ranked by how well you match, and draft
          a cover letter that only states facts from your CV.
        </p>
        <div className="mt-8 flex flex-wrap items-start gap-3">
          <DemoButton variant="default" size="lg" />
          <Link href="/sign-up" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Sign up
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          The demo gives you a temporary account with sample data. No email needed.
        </p>
      </div>
      <SampleMatch />
    </section>
  );
}
