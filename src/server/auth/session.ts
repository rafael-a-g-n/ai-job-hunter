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
  return getUserFromHeaders(await headers());
}

/** The signed-in user for the given request headers (route handlers), or null. */
export async function getUserFromHeaders(requestHeaders: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, email, isDemo, demoExpiresAt } = session.user;
  // A demo account stops working at its expiry, even if cleanup has not deleted it yet.
  if (isDemo && (!demoExpiresAt || new Date(demoExpiresAt).getTime() < Date.now())) return null;
  return { id, email, isDemo: Boolean(isDemo) };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getOptionalUser();
  if (!user) redirect("/sign-in");
  return user;
}
