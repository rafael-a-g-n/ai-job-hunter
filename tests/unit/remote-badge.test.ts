import { describe, expect, it } from "vitest";
import { remoteBadgeText } from "@/components/jobs/posted-ago";

describe("remoteBadgeText", () => {
  it("shows the scope of a remote job", () => {
    expect(remoteBadgeText({ remote: true, remoteScope: "Europe" })).toBe("Remote · Europe");
  });
  it("falls back to plain Remote without a scope", () => {
    expect(remoteBadgeText({ remote: true, remoteScope: null })).toBe("Remote");
  });
  it("shows nothing for a job that is not remote", () => {
    expect(remoteBadgeText({ remote: false, remoteScope: "Europe" })).toBeNull();
  });
});
