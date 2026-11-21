import Link from "next/link";
import { Suspense } from "react";
import { UploadForm } from "@/components/cv/upload-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreferredLanguage } from "@/server/account/preferences";
import { requireUser } from "@/server/auth/session";
import { listCvs } from "@/server/cv/queries";

export const maxDuration = 120;

async function CvList() {
  const user = await requireUser();
  const cvs = await listCvs(user.id);
  if (cvs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your CVs</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {cvs.map((cv) => (
            <li key={cv.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link href={`/cv/${cv.id}`} className="underline-offset-4 hover:underline">
                {cv.fileName}
              </Link>
              <span className="flex items-center gap-2">
                {cv.isActive && <Badge>Active</Badge>}
                <Badge variant="outline">{cv.status.toLowerCase()}</Badge>
                <time dateTime={cv.createdAt.toISOString()} className="text-muted-foreground">
                  {cv.createdAt.toISOString().slice(0, 10)}
                </time>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

async function CvUpload() {
  const user = await requireUser();
  return <UploadForm defaultLanguage={await getPreferredLanguage(user.id)} />;
}

export default function CvPage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 p-6">
      <h1 className="text-xl font-semibold">Your CV</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <CvUpload />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your CVs…</p>}>
        <CvList />
      </Suspense>
    </main>
  );
}
