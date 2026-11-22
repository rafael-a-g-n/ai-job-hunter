import { describe, expect, it, vi } from "vitest";
import { BrevoMailer } from "@/server/mail/brevo";
import { parseSender } from "@/server/mail/sender";

const msg = { to: "to@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

describe("parseSender", () => {
  it("parses Name <email>", () => {
    expect(parseSender("AI Job Hunter <noreply@example.com>")).toEqual({
      name: "AI Job Hunter",
      email: "noreply@example.com",
    });
  });
  it("strips quotes around the name", () => {
    expect(parseSender('"Job Hunter" <a@b.co>')).toEqual({ name: "Job Hunter", email: "a@b.co" });
  });
  it("parses a bare email", () => {
    expect(parseSender("  a@b.co ")).toEqual({ email: "a@b.co" });
  });
});

describe("BrevoMailer", () => {
  it("posts to the Brevo transactional endpoint", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("{}", { status: 201 }));
    await new BrevoMailer("KEY", "Me <me@example.com>", fetchFn).send(msg);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("KEY");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      sender: { name: "Me", email: "me@example.com" },
      to: [{ email: "to@example.com" }],
      subject: "Hi",
      htmlContent: "<p>Hi</p>",
      textContent: "Hi",
    });
  });

  it("omits the sender name for a bare EMAIL_FROM", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("{}", { status: 201 }));
    await new BrevoMailer("KEY", "me@example.com", fetchFn).send(msg);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).sender).toEqual({
      email: "me@example.com",
    });
  });

  it("throws naming Brevo and the status, without leaking key or body", async () => {
    const fetchFn = vi.fn(async () => new Response('{"message":"secret-detail"}', { status: 401 }));
    const err = await new BrevoMailer("KEY123", "me@example.com", fetchFn)
      .send(msg)
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("Brevo");
    expect((err as Error).message).toContain("401");
    expect((err as Error).message).not.toContain("KEY123");
    expect((err as Error).message).not.toContain("secret-detail");
    expect((err as Error).message).not.toContain("<p>Hi</p>");
  });

  it("aborts after the timeout", async () => {
    const fetchFn = vi.fn(
      (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
        }),
    );
    const p = new BrevoMailer("KEY", "me@example.com", fetchFn, 20).send(msg);
    await expect(p).rejects.toThrow(/Brevo.*timed out/);
  });
});
