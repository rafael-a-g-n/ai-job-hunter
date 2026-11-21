import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { listLetters } from "@/server/letters/crud";

async function Letters() {
  const user = await requireUser();
  const letters = await listLetters(user.id);
  if (letters.length === 0) {
    return (
      <p className="text-sm">
        No cover letters yet. Open a job and choose &quot;Write cover letter&quot;.
      </p>
    );
  }
  const fmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
  return (
    <ul className="grid gap-3">
      {letters.map((l) => (
        <li key={l.id}>
          <Link href={`/letters/${l.id}`} className="block">
            <Card className="hover:bg-muted/50">
              <CardContent className="grid gap-1">
                <p className="font-medium">{l.job.title}</p>
                <p className="text-sm text-muted-foreground">
                  {l.job.company} - {fmt.format(l.createdAt)}
                </p>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function LettersPage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 p-6">
      <h1 className="text-xl font-semibold">Cover letters</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <Letters />
      </Suspense>
    </main>
  );
}
