import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  TURNSTILE_BYPASS: false,
  TURNSTILE_SECRET_KEY: "secret" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: envMock }));

import { verifyTurnstile } from "@/server/demo/turnstile";

describe("verifyTurnstile", () => {
  beforeEach(() => {
    envMock.TURNSTILE_BYPASS = false;
    envMock.TURNSTILE_SECRET_KEY = "secret";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is true without calling Cloudflare when bypassed", async () => {
    envMock.TURNSTILE_BYPASS = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyTurnstile("", "1.1.1.1")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the secret, token and IP to siteverify", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyTurnstile("tok", "1.1.1.1")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.1.1.1");
  });

  it("is false when Cloudflare rejects the token, errors, or is unreachable", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ success: false }));
    expect(await verifyTurnstile("tok", "ip")).toBe(false);
    vi.stubGlobal("fetch", async () => new Response("no", { status: 500 }));
    expect(await verifyTurnstile("tok", "ip")).toBe(false);
    vi.stubGlobal("fetch", async () => {
      throw new Error("network");
    });
    expect(await verifyTurnstile("tok", "ip")).toBe(false);
  });

  it("fails closed when the secret is missing and bypass is off", async () => {
    envMock.TURNSTILE_SECRET_KEY = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await verifyTurnstile("tok", "ip")).toBe(false);
    expect(err).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("aborts after 5 s and fails closed", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const pending = verifyTurnstile("tok", "ip");
    controller.abort(new DOMException("timed out", "TimeoutError"));
    expect(await pending).toBe(false);
    expect(timeout).toHaveBeenCalledWith(5000);
    timeout.mockRestore();
  });

  it("is false for an empty token", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(await verifyTurnstile("", "ip")).toBe(false);
  });
});
