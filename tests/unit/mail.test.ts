import { beforeEach, describe, expect, it } from "vitest";
import { ConsoleMailer, sentMessages } from "@/server/mail/console";
import { resetPasswordEmail, verificationEmail } from "@/server/mail/templates";

describe("console mailer", () => {
  beforeEach(() => {
    sentMessages.length = 0;
  });

  it("records the message it is asked to send", async () => {
    const msg = { to: "a@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };
    await new ConsoleMailer(() => {}).send(msg);
    expect(sentMessages).toEqual([msg]);
  });
});

describe("email templates", () => {
  const url = "https://app.example.com/api/auth/verify-email?token=abc&callbackURL=%2Fdashboard";

  it("verification email includes the URL in html and text", () => {
    const m = verificationEmail(url);
    expect(m.html).toContain(
      "https://app.example.com/api/auth/verify-email?token=abc&amp;callbackURL=%2Fdashboard",
    );
    expect(m.text).toContain(url);
    expect(m.subject.length).toBeGreaterThan(0);
  });

  it("reset password email includes the URL in html and text", () => {
    const m = resetPasswordEmail(url);
    expect(m.html).toContain("token=abc");
    expect(m.text).toContain(url);
  });
});
