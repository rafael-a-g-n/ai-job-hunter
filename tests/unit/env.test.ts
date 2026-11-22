import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "x".repeat(32),
  AI_PROVIDER: "mock",
  EMBEDDINGS_PROVIDER: "fake",
  STORAGE_PROVIDER: "local",
  MAIL_PROVIDER: "console",
  EMAIL_FROM: "Job Hunter <noreply@example.com>",
  CRON_SECRET: "cron-secret",
};

describe("parseEnv", () => {
  describe("ADZUNA_COUNTRIES", () => {
    it("defaults to Spain when unset or empty", () => {
      expect(parseEnv(valid).ADZUNA_COUNTRIES).toEqual(["es"]);
      expect(parseEnv({ ...valid, ADZUNA_COUNTRIES: "" }).ADZUNA_COUNTRIES).toEqual(["es"]);
    });

    it("parses a comma-separated list, trimmed and lower-cased", () => {
      expect(parseEnv({ ...valid, ADZUNA_COUNTRIES: " ES, gb " }).ADZUNA_COUNTRIES).toEqual([
        "es",
        "gb",
      ]);
    });

    it("rejects countries the Adzuna API does not support, such as Portugal", () => {
      expect(() => parseEnv({ ...valid, ADZUNA_COUNTRIES: "pt" })).toThrow(/ADZUNA_COUNTRIES/);
    });

    it("rejects more than 4 countries (the free key allows 250 requests a day)", () => {
      expect(() => parseEnv({ ...valid, ADZUNA_COUNTRIES: "es,gb,fr,de,it" })).toThrow(
        /ADZUNA_COUNTRIES/,
      );
    });
  });

  it("throws when AI_PROVIDER is anthropic without ANTHROPIC_API_KEY", () => {
    expect(() => parseEnv({ ...valid, AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("requires GOOGLE_GENERATIVE_AI_API_KEY when AI_PROVIDER is google", () => {
    expect(() => parseEnv({ ...valid, AI_PROVIDER: "google" })).toThrow(
      /GOOGLE_GENERATIVE_AI_API_KEY/,
    );
    expect(() =>
      parseEnv({ ...valid, AI_PROVIDER: "google", GOOGLE_GENERATIVE_AI_API_KEY: "" }),
    ).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(() =>
      parseEnv({ ...valid, AI_PROVIDER: "google", GOOGLE_GENERATIVE_AI_API_KEY: "k" }),
    ).not.toThrow();
  });

  it("requires GOOGLE_GENERATIVE_AI_API_KEY when EMBEDDINGS_PROVIDER is gemini", () => {
    expect(() => parseEnv({ ...valid, EMBEDDINGS_PROVIDER: "gemini" })).toThrow(
      /GOOGLE_GENERATIVE_AI_API_KEY/,
    );
    expect(() =>
      parseEnv({ ...valid, EMBEDDINGS_PROVIDER: "gemini", GOOGLE_GENERATIVE_AI_API_KEY: "" }),
    ).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(() =>
      parseEnv({ ...valid, EMBEDDINGS_PROVIDER: "gemini", GOOGLE_GENERATIVE_AI_API_KEY: "k" }),
    ).not.toThrow();
  });

  it("passes with the mock AI provider and no key", () => {
    expect(() => parseEnv({ ...valid, AI_PROVIDER: "mock" })).not.toThrow();
  });

  it("requires the key of every selected real provider", () => {
    expect(() => parseEnv({ ...valid, EMBEDDINGS_PROVIDER: "voyage" })).toThrow(/VOYAGE_API_KEY/);
    expect(() => parseEnv({ ...valid, STORAGE_PROVIDER: "vercel-blob" })).toThrow(
      /BLOB_READ_WRITE_TOKEN/,
    );
    expect(() => parseEnv({ ...valid, MAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(() => parseEnv({ ...valid, MAIL_PROVIDER: "brevo" })).toThrow(/BREVO_API_KEY/);
    expect(() => parseEnv({ ...valid, MAIL_PROVIDER: "brevo", BREVO_API_KEY: "k" })).not.toThrow();
  });

  it("defaults GLOBAL_DAILY_AI_BUDGET_USD to 5 and TURNSTILE_BYPASS to false", () => {
    const env = parseEnv(valid);
    expect(env.GLOBAL_DAILY_AI_BUDGET_USD).toBe(5);
    expect(env.TURNSTILE_BYPASS).toBe(false);
  });

  it("coerces budget and bypass from strings", () => {
    const env = parseEnv({ ...valid, GLOBAL_DAILY_AI_BUDGET_USD: "2.5", TURNSTILE_BYPASS: "true" });
    expect(env.GLOBAL_DAILY_AI_BUDGET_USD).toBe(2.5);
    expect(env.TURNSTILE_BYPASS).toBe(true);
  });

  it("treats empty optional values as unset", () => {
    expect(() => parseEnv({ ...valid, AI_PROVIDER: "mock", ANTHROPIC_API_KEY: "" })).not.toThrow();
    expect(() => parseEnv({ ...valid, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "" })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });
});
