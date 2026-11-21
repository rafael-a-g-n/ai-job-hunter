import { describe, expect, it } from "vitest";
import { safeExternalUrl, safeNext } from "@/lib/safe-url";

describe("safeExternalUrl", () => {
  it("allows http and https", () => {
    expect(safeExternalUrl("http://example.com/a")).toBe("http://example.com/a");
    expect(safeExternalUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
  });
  it("rejects other schemes, relative URLs, empty and null", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(safeExternalUrl("/jobs/1")).toBeNull();
    expect(safeExternalUrl("example.com")).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe("safeNext", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNext("/jobs/matches")).toBe("/jobs/matches");
    expect(safeNext("/jobs?remote=1#top")).toBe("/jobs?remote=1#top");
    expect(safeNext("/letters/abc%20def")).toBe("/letters/abc%20def");
  });

  it("falls back to /dashboard for missing or non-path values", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
    expect(safeNext("jobs")).toBe("/dashboard");
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
    expect(safeNext("/%5Cevil.com")).toBe("/dashboard");
    expect(safeNext("/%5cevil.com")).toBe("/dashboard");
    expect(safeNext("/%2F/evil.com")).toBe("/dashboard");
  });

  it("rejects control characters, raw or encoded", () => {
    expect(safeNext("/\t/evil.com")).toBe("/dashboard");
    expect(safeNext("/\n/evil.com")).toBe("/dashboard");
    expect(safeNext("/%09/evil.com")).toBe("/dashboard");
    expect(safeNext("/%E0%A4%A")).toBe("/dashboard");
  });
});
