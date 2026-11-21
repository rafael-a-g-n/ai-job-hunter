import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sentMessages } from "@/server/mail/console";

const EMAIL = "ada@example.com";
const PASSWORD = "correct-horse-1";

beforeEach(() => {
  sentMessages.length = 0;
});

async function signUp(email = EMAIL, password = PASSWORD) {
  return auth.api.signUpEmail({ body: { email, password, name: "Ada" } });
}

/** Extracts the token from the link in the latest mail and runs the verification endpoint. */
function tokenFromLastMail(): string {
  const text = sentMessages.at(-1)?.text ?? "";
  const url = text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("no URL in mail");
  const token = new URL(url).searchParams.get("token") ?? new URL(url).pathname.split("/").pop();
  if (!token) throw new Error("no token in URL");
  return token;
}

describe("auth", () => {
  it("sign-up stores an unverified user and sends one verification mail", async () => {
    await signUp();
    const user = await db.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.emailVerified).toBe(false);
    expect(user.isDemo).toBe(false);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].to).toBe(EMAIL);
  });

  it("rejects sign-in before the email is verified", async () => {
    await signUp();
    await expect(
      auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } }),
    ).rejects.toThrow();
  });

  it("allows sign-in after the verification token is used", async () => {
    await signUp();
    await auth.api.verifyEmail({ query: { token: tokenFromLastMail() } });
    const user = await db.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.emailVerified).toBe(true);
    const res = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } });
    expect(res.user.email).toBe(EMAIL);
  });

  it("does not create a second account for a duplicate email", async () => {
    // With requireEmailVerification Better Auth answers a duplicate sign-up with a
    // synthetic success (no account enumeration) but must not create or alter anything.
    await signUp();
    const verificationToken = tokenFromLastMail();
    const before = await db.user.findUniqueOrThrow({ where: { email: EMAIL } });
    const res = await signUp(EMAIL, "another-password-9");
    expect(res.token).toBeNull();
    expect(await db.user.count()).toBe(1);
    const after = await db.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(after.id).toBe(before.id);
    expect(await db.account.count()).toBe(1);

    // The original password is untouched.
    await auth.api.verifyEmail({ query: { token: verificationToken } });
    await expect(
      auth.api.signInEmail({ body: { email: EMAIL, password: "another-password-9" } }),
    ).rejects.toThrow();
    const ok = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } });
    expect(ok.user.id).toBe(before.id);
  });

  it("rejects a 7-character password", async () => {
    await expect(signUp(EMAIL, "1234567")).rejects.toThrow();
    expect(await db.user.count()).toBe(0);
  });

  it("password reset changes the password", async () => {
    await signUp();
    await auth.api.verifyEmail({ query: { token: tokenFromLastMail() } });
    sentMessages.length = 0;

    await auth.api.requestPasswordReset({ body: { email: EMAIL, redirectTo: "/reset-password" } });
    expect(sentMessages).toHaveLength(1);
    const token = tokenFromLastMail();

    await auth.api.resetPassword({ body: { newPassword: "brand-new-pass-2", token } });

    await expect(
      auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } }),
    ).rejects.toThrow();
    const res = await auth.api.signInEmail({
      body: { email: EMAIL, password: "brand-new-pass-2" },
    });
    expect(res.user.email).toBe(EMAIL);
  });
});
