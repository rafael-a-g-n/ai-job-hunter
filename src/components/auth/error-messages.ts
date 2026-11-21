/** Shown when Better Auth's rate limiter answers 429. */
export const TOO_MANY_ATTEMPTS = "Too many attempts. Try again in a few minutes.";

export function signInErrorMessage(status: number): string {
  if (status === 429) return TOO_MANY_ATTEMPTS;
  if (status === 403) return "Please verify your email before signing in.";
  return "Invalid email or password.";
}

/** Sign-up and password-reset errors: the rate limit gets our wording, others keep theirs. */
export function authErrorMessage(
  error: { status: number; message?: string | null },
  fallback: string,
): string {
  if (error.status === 429) return TOO_MANY_ATTEMPTS;
  return error.message ?? fallback;
}
