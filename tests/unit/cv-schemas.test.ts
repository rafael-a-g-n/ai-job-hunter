import { describe, expect, it } from "vitest";
import { MOCK_FIXTURES } from "@/server/ai/mock";
import {
  clampAnalysisResult,
  CvAnalysis,
  CvAnalysisAiResult,
  CvAnalysisResult,
  CvProfile,
  profileToText,
} from "@/server/cv/schemas";

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

  it("accepts a rich CV over the list caps and clamps it to them", () => {
    const f = fixture();
    const skill = f.profile.skills[0];
    f.profile.skills = Array.from({ length: 95 }, (_, i) => ({ ...skill, name: `Skill ${i}` }));
    f.profile.experience[0].highlights = Array.from({ length: 25 }, (_, i) => `Did ${i}`);
    f.analysis.strengths = Array.from({ length: 7 }, (_, i) => `Strength ${i}`);
    f.analysis.improvements = Array.from({ length: 10 }, () => f.analysis.improvements[0]);

    expect(CvAnalysisResult.safeParse(f).success).toBe(false);
    const lenient = CvAnalysisAiResult.parse(f);
    const clamped = clampAnalysisResult(lenient);
    expect(clamped.profile.skills).toHaveLength(80);
    expect(clamped.profile.skills[79].name).toBe("Skill 79");
    expect(clamped.profile.experience[0].highlights).toHaveLength(20);
    expect(clamped.analysis.strengths).toHaveLength(5);
    expect(clamped.analysis.improvements).toHaveLength(8);
  });

  it("still requires at least one strength and one improvement", () => {
    const f = fixture();
    f.analysis.strengths = [];
    expect(CvAnalysisAiResult.safeParse(f).success).toBe(false);
  });
});
