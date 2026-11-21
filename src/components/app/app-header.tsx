import { getOptionalUser } from "@/server/auth/session";
import { AppNav } from "./app-nav";

/** Reads the session, so render it inside Suspense. */
export async function AppHeader() {
  const user = await getOptionalUser();
  return <AppNav email={user?.email ?? null} />;
}
