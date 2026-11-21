import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  email: string;
  isDemo: boolean;
}

/** The signed-in user, or null. Reads request headers, so call it inside Suspense. */
export async function getOptionalUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, email, isDemo } = session.user;
  return { id, email, isDemo: Boolean(isDemo) };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getOptionalUser();
  if (!user) redirect("/sign-in");
  return user;
}
