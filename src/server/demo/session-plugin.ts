import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";

/**
 * Server-only Better Auth plugin: creates a session (and its cookie) for an existing demo user.
 * `SERVER_ONLY` keeps the endpoint off the HTTP router, so only `auth.api.createDemoSession`
 * (called from our own route) can reach it. The session ends when the demo account expires.
 */
export const demoSession = () =>
  ({
    id: "demo-session",
    endpoints: {
      createDemoSession: createAuthEndpoint(
        "/demo/create-session",
        {
          method: "POST",
          body: z.object({ userId: z.string().min(1) }),
          metadata: { SERVER_ONLY: true },
        },
        async (ctx) => {
          const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
          const extra = user as { isDemo?: boolean; demoExpiresAt?: Date | null } | null;
          if (!user || !extra?.isDemo || !extra.demoExpiresAt) {
            throw ctx.error("BAD_REQUEST", { message: "Not a demo user" });
          }
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            false,
            { expiresAt: extra.demoExpiresAt },
            true,
          );
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ token: session.token });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
