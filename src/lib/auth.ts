import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getMailer } from "@/server/mail/mailer";
import { resetPasswordEmail, verificationEmail } from "@/server/mail/templates";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await getMailer().send({ to: user.email, ...resetPasswordEmail(url) });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await getMailer().send({ to: user.email, ...verificationEmail(url) });
    },
  },
  user: {
    additionalFields: {
      isDemo: { type: "boolean", required: false, defaultValue: false, input: false },
      demoExpiresAt: { type: "date", required: false, input: false },
    },
  },
  rateLimit: { enabled: true },
  plugins: [nextCookies()],
});
