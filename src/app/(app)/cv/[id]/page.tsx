import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalyzeButton } from "@/components/cv/analyze-button";
import { ProfileEditor } from "@/components/cv/profile-editor";
import { CvReport } from "@/components/cv/report";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { getCv } from "@/server/cv/queries";
import { CvAnalysis, CvProfile } from "@/server/cv/schemas";

async function CvDetail({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const cv = await getCv(user.id, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  const profile = CvProfile.safeParse(cv.profile);
  const analysis = CvAnalysis.safeParse(cv.analysis);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold">{cv.fileName}</h1>
        <Link href="/cv" className="text-sm text-muted-foreground underline underline-offset-4">
          Back to your CVs
        </Link>
      </div>

      {cv.status === "ANALYZED" && analysis.success && profile.success ? (
        <>
          <CvReport analysis={analysis.data} />
          <ProfileEditor key={cv.updatedAt.toISOString()} cvId={cv.id} initial={profile.data} />
          <AnalyzeButton cvId={cv.id} label="Re-analyse CV" />
        </>
      ) : cv.status === "UPLOADED" ? (
        <div className="grid gap-3">
          <p className="text-sm">This CV has not been analysed yet.</p>
          <AnalyzeButton cvId={cv.id} />
        </div>
      ) : cv.status === "ANALYZING" ? (
        <p className="text-sm">Analysis in progress. Refresh in a moment.</p>
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {cv.failureReason ?? "This CV could not be analysed."} Upload it again from{" "}
          <Link href="/cv" className="underline underline-offset-4">
            your CVs
          </Link>
          .
        </p>
      )}
    </div>
  );
}

export default function CvDetailPage({ params }: PageProps<"/cv/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <CvDetail params={params} />
      </Suspense>
    </main>
  );
}
