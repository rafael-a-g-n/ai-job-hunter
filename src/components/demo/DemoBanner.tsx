import Link from "next/link";
import { db } from "@/lib/db";
import { getOptionalUser } from "@/server/auth/session";

function hoursLeft(expiresAt: Date | null): number {
  return Math.max(0, Math.ceil(((expiresAt?.getTime() ?? 0) - Date.now()) / 3_600_000));
}

/** "Expires in Xh" for a demo account; reads the session, so render it inside Suspense. */
export async function DemoBanner() {
  const user = await getOptionalUser();
  if (!user?.isDemo) return null;
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { demoExpiresAt: true },
  });
  const hours = hoursLeft(row?.demoExpiresAt ?? null);
  const remaining = hours > 0 ? `expires in ${hours}h` : "expired";
  return (
    <div role="status" className="bg-muted px-4 py-2 text-center text-sm">
      Demo account · {remaining} ·{" "}
      <Link href="/sign-up" className="font-medium underline underline-offset-4">
        Create a real account
      </Link>
    </div>
  );
}
