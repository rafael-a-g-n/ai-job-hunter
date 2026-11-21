import { env } from "@/lib/env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Verifies a Cloudflare Turnstile token. Always true with TURNSTILE_BYPASS; fails closed otherwise. */
export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (env.TURNSTILE_BYPASS) return true;
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[demo] TURNSTILE_SECRET_KEY is not set and TURNSTILE_BYPASS is off");
    return false;
  }
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
