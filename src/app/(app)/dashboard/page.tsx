import { Suspense } from "react";
import { requireUser } from "@/server/auth/session";

async function Greeting() {
  const user = await requireUser();
  return <p>Signed in as {user.email}</p>;
}

// Placeholder; replaced in Task 16.
export default function DashboardPage() {
  return (
    <main className="p-6">
      <h1 className="mb-2 text-xl font-semibold">Dashboard</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Greeting />
      </Suspense>
    </main>
  );
}
