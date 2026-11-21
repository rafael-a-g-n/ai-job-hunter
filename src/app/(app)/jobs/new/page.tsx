import Link from "next/link";
import { ManualJobForm } from "@/components/jobs/manual-job-form";

// The form's server action normalizes the posting with an AI call.
export const maxDuration = 60;

export default function NewJobPage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 p-6">
      <div className="grid gap-1.5">
        <Link href="/jobs" className="text-sm text-muted-foreground underline underline-offset-4">
          Back to jobs
        </Link>
        <h1 className="text-xl font-semibold">Paste a job</h1>
        <p className="text-sm text-muted-foreground">
          Paste a job posting and the AI will tidy it up. It is private to you.
        </p>
      </div>
      <ManualJobForm />
    </main>
  );
}
