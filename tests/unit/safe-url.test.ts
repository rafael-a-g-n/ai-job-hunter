import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "@/lib/safe-url";

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
