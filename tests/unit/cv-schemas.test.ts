import { describe, expect, it } from "vitest";
import { MOCK_FIXTURES } from "@/server/ai/mock";
import { CvAnalysis, CvAnalysisResult, CvProfile, profileToText } from "@/server/cv/schemas";

const fixture = () => structuredClone(MOCK_FIXTURES["cv.analysis"]) as CvAnalysisResult;

describe("cv schemas", () => {
  it("parses the cv.analysis mock fixture", () => {
    expect(CvAnalysisResult.safeParse(MOCK_FIXTURES["cv.analysis"]).success).toBe(true);
  });

  it("rejects an overallScore of 120", () => {
    const f = fixture();
    f.analysis.overallScore = 120;
    expect(CvAnalysis.safeParse(f.analysis).success).toBe(false);
  });

  it("rejects an unknown seniority and a skill level of 6", () => {
    const f = fixture();
    expect(CvProfile.safeParse({ ...f.profile, seniority: "guru" }).success).toBe(false);
    f.profile.skills[0] = { ...f.profile.skills[0], level: 6 as never };
    expect(CvProfile.safeParse(f.profile).success).toBe(false);
  });

  it("profileToText includes the headline, skills and experience", () => {
    const text = profileToText(fixture().profile);
    expect(text).toContain("Frontend Developer");
    expect(text).toContain("React");
    expect(text).toContain("TypeScript");
    expect(text).toContain("Acme Digital");
    expect(text).toContain("Cut page load time by 35%");
  });
});
