import Link from "next/link";
import { DemoButton } from "@/components/demo/DemoButton";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">AI Job Hunter</h1>
      <p className="max-w-md text-muted-foreground">
        Analyse your CV, find matching jobs and draft cover letters with AI.
      </p>
      <div className="flex flex-col items-center gap-3">
        <DemoButton />
        <Link href="/sign-in" className="text-sm underline underline-offset-4">
          Sign in
        </Link>
      </div>
    </main>
  );
}
