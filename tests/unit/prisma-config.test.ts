import { afterEach, describe, expect, it, vi } from "vitest";

async function cliUrl(env: Record<string, string | undefined>): Promise<string | undefined> {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const config = (await import("../../prisma.config")).default;
  return config.datasource?.url;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prisma.config", () => {
  it("uses DIRECT_DATABASE_URL for the CLI when set", async () => {
    expect(
      await cliUrl({ DIRECT_DATABASE_URL: "postgres://direct", DATABASE_URL: "postgres://pooled" }),
    ).toBe("postgres://direct");
  });

  it("falls back to DATABASE_URL", async () => {
    expect(await cliUrl({ DIRECT_DATABASE_URL: "", DATABASE_URL: "postgres://pooled" })).toBe(
      "postgres://pooled",
    );
  });
});
