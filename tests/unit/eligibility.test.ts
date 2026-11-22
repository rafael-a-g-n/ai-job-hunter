import { describe, expect, it } from "vitest";
import {
  EEA_COUNTRIES,
  EU_COUNTRIES,
  EUROPE_COUNTRIES,
  isEligibleLocation,
  scopeLabel,
} from "@/server/jobs/eligibility";

describe("country lists", () => {
  it("has the 27 EU members, all inside the EEA and Europe lists", () => {
    expect(EU_COUNTRIES).toHaveLength(27);
    for (const c of EU_COUNTRIES) {
      expect(EEA_COUNTRIES).toContain(c);
      expect(EUROPE_COUNTRIES).toContain(c);
    }
    expect(EUROPE_COUNTRIES).toEqual(
      expect.arrayContaining(["Portugal", "Norway", "Switzerland", "United Kingdom", "Serbia"]),
    );
  });
});

describe("isEligibleLocation (candidate in Portugal)", () => {
  it.each([
    "Worldwide",
    "worldwide",
    "Anywhere",
    "Anywhere in the world",
    "Global",
    "Europe",
    "European Union",
    "EU",
    "EEA",
    "EMEA",
    "Europe, Americas",
    "Americas, Europe",
    "LATAM, Europe, USA, Canada, APAC",
    "Portugal",
    "portugal",
    "Portugal, Spain",
    "CET timezone",
    "Europe (CET)",
  ])("accepts %j", (text) => {
    expect(isEligibleLocation(text, "Portugal")).toBe(true);
  });

  it.each([
    "USA",
    "USA Only",
    "USA, Canada",
    "USA, Canada, USA timezones",
    "LATAM",
    "Americas",
    "North America",
    "APAC",
    "Asia",
    "UK",
    "United Kingdom",
    "Germany",
    "Brazil",
    "Nigeria",
    "India",
    "",
    "   ",
  ])("rejects %j", (text) => {
    expect(isEligibleLocation(text, "Portugal")).toBe(false);
  });

  it("does not match a country name inside a longer word", () => {
    expect(isEligibleLocation("Niger", "Nigeria")).toBe(false);
    expect(isEligibleLocation("Nigeria", "Nigeria")).toBe(true);
  });
});

describe("isEligibleLocation for other candidates", () => {
  it("accepts only the candidate's own country when it is outside Europe", () => {
    expect(isEligibleLocation("Europe", "Brazil")).toBe(false);
    expect(isEligibleLocation("EMEA", "Brazil")).toBe(false);
    expect(isEligibleLocation("Worldwide", "Brazil")).toBe(true);
    expect(isEligibleLocation("Brazil", "Brazil")).toBe(true);
    expect(isEligibleLocation("LATAM, Brazil", "Brazil")).toBe(true);
  });

  it("treats EU as EU-only", () => {
    expect(isEligibleLocation("EU", "Germany")).toBe(true);
    expect(isEligibleLocation("EU", "United Kingdom")).toBe(false);
    expect(isEligibleLocation("Europe", "United Kingdom")).toBe(true);
    expect(isEligibleLocation("EEA", "Norway")).toBe(true);
    expect(isEligibleLocation("EEA", "Switzerland")).toBe(false);
  });

  it("knows common names of the candidate country", () => {
    expect(isEligibleLocation("UK", "United Kingdom")).toBe(true);
    expect(isEligibleLocation("Great Britain", "United Kingdom")).toBe(true);
    expect(isEligibleLocation("Czech Republic", "Czechia")).toBe(true);
  });
});

describe("scopeLabel", () => {
  it.each([
    ["Worldwide", "Worldwide"],
    ["Anywhere", "Worldwide"],
    ["Global", "Worldwide"],
    ["Europe", "Europe"],
    ["EMEA", "EMEA"],
    ["EU", "EU"],
    ["European Union", "EU"],
    ["EEA", "EEA"],
    ["CET timezone", "Europe"],
    ["Americas, Europe", "Europe & Americas"],
    ["Europe, Americas", "Europe & Americas"],
    ["LATAM, Europe, USA, Canada, APAC", "Europe"],
    ["Portugal", "Portugal"],
    ["portugal", "Portugal"],
    ["UK", "United Kingdom"],
    ["Germany", "Germany"],
    ["USA Only", "USA Only"],
  ])("labels %j as %j", (text, label) => {
    expect(scopeLabel(text)).toBe(label);
  });

  it("trims and caps unknown text at 40 characters", () => {
    expect(scopeLabel("  Somewhere nice  ")).toBe("Somewhere nice");
    const out = scopeLabel("x".repeat(60));
    expect(out).toHaveLength(40);
  });
});
