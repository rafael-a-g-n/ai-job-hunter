import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LetterEditor } from "@/components/letters/letter-editor";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { getLetter } from "@/server/letters/crud";
import { PageSkeleton } from "@/components/app/page-skeleton";

async function LetterView({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const letter = await getLetter(user.id, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Link
          href="/letters"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to letters
        </Link>
        <h1 className="text-xl font-semibold">Cover letter</h1>
        <p className="text-sm text-muted-foreground">
          For{" "}
          <Link href={`/jobs/${letter.job.id}`} className="underline underline-offset-4">
            {letter.job.title}
          </Link>{" "}
          at {letter.job.company}
        </p>
      </div>
      <LetterEditor
        letterId={letter.id}
        jobId={letter.jobId}
        initialContent={letter.content}
        options={{
          tone: letter.tone,
          language: letter.language === "pt" ? "pt" : "en",
          length: letter.length,
        }}
      />
    </div>
  );
}

export default function LetterPage({ params }: PageProps<"/letters/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Suspense fallback={<PageSkeleton />}>
        <LetterView params={params} />
      </Suspense>
    </main>
  );
}
