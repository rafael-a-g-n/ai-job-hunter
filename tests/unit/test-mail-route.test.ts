import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/test/mail/route";
import { sentMessages } from "@/server/mail/console";

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  connection: async () => undefined,
}));

const call = (qs = "") => GET(new NextRequest(`http://localhost/api/test/mail${qs}`));

describe("GET /api/test/mail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    sentMessages.length = 0;
  });

  it("is a 404 without E2E=1", async () => {
    vi.stubEnv("MAIL_PROVIDER", "console");
    vi.stubEnv("E2E", "");
    expect((await call()).status).toBe(404);
  });

  it("is a 404 when the mail provider is not the console mailer", async () => {
    vi.stubEnv("E2E", "1");
    vi.stubEnv("MAIL_PROVIDER", "resend");
    expect((await call()).status).toBe(404);
  });

  it("returns the sent messages, optionally filtered by recipient", async () => {
    vi.stubEnv("E2E", "1");
    vi.stubEnv("MAIL_PROVIDER", "console");
    sentMessages.push(
      { to: "a@x.test", subject: "A", html: "", text: "a" },
      { to: "b@x.test", subject: "B", html: "", text: "b" },
    );
    const all = (await (await call()).json()) as { messages: unknown[] };
    expect(all.messages).toHaveLength(2);
    const one = (await (await call("?to=b@x.test")).json()) as { messages: { subject: string }[] };
    expect(one.messages.map((m) => m.subject)).toEqual(["B"]);
  });
});
