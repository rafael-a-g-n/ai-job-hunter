import { describe, expect, it } from "vitest";
import {
  EEA_COUNTRIES,
  EU_COUNTRIES,
  EUROPE_COUNTRIES,
  isEligibleLocation,
  scopeFromCountries,
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

describe("isEligibleLocation: qualifiers and look-alikes", () => {
  it.each([
    "Anywhere in the US",
    "Anywhere in the USA",
    "Global (US only)",
    "Worldwide, US only",
    "Worldwide, based in the US",
    "Worldwide except Europe",
    "Worldwide excluding Portugal",
    "Worldwide (excluding EMEA)",
    "Europe except Portugal",
    "EU excluding Portugal",
    "Eastern Europe",
    "Central Europe",
    "Central and Eastern Europe",
    "CEE",
    "Nordics",
    "Scandinavia",
    "DACH",
    "Benelux",
    "Balkans",
    "Anywhere in North America",
    "Worldwide, residents of Canada",
  ])("rejects %j", (text) => {
    expect(isEligibleLocation(text, "Portugal")).toBe(false);
  });

  it.each([
    "Worldwide except US",
    "Worldwide excluding USA, Canada",
    "Anywhere in the world",
    "Anywhere in Europe",
    "Worldwide (Europe only)",
    "Europe only",
    "Europe except UK",
    "Eastern Europe, Portugal",
    "Global, based in Portugal",
    "Worldwide, remote only",
  ])("accepts %j", (text) => {
    expect(isEligibleLocation(text, "Portugal")).toBe(true);
  });

  it("applies the exclusion to the candidate's own country", () => {
    expect(isEligibleLocation("Europe except UK", "United Kingdom")).toBe(false);
    expect(isEligibleLocation("Worldwide except Brazil", "Brazil")).toBe(false);
    expect(isEligibleLocation("Worldwide except Europe", "Brazil")).toBe(true);
  });
});

describe("isEligibleLocation: time zones (candidate in Portugal)", () => {
  it.each([
    "UTC+0",
    "UTC",
    "GMT",
    "WET",
    "UTC+1",
    "UTC-1 to UTC+3",
    "UTC+0 to UTC+4",
    "UTC-3-UTC+3",
    "UTC ± 3",
    "GMT +/- 2",
    "CET +/- 2",
    "CET-1 to CET+2",
    "Iberia",
    "UK timezone",
    "UK time zone",
  ])("accepts %j", (text) => {
    expect(isEligibleLocation(text, "Portugal")).toBe(true);
  });

  it.each([
    "UTC-5",
    "UTC-8 to UTC-5",
    "UTC+2 to UTC+5",
    "UTC+5:30",
    "US timezones (UTC-8 to UTC-5)",
  ])("rejects %j", (text) => {
    expect(isEligibleLocation(text, "Portugal")).toBe(false);
  });

  it("is only used for candidates in Europe", () => {
    expect(isEligibleLocation("UTC+0", "Brazil")).toBe(false);
    expect(isEligibleLocation("GMT", "Brazil")).toBe(false);
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
    ["LATAM, Europe, USA, Canada, APAC", "Europe & more"],
    ["EMEA, LATAM, Canada, USA", "EMEA & Americas"],
    ["Europe, Africa", "Europe & more"],
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

describe("scopeFromCountries (Himalayas locationRestrictions)", () => {
  const europe = [...EUROPE_COUNTRIES].filter((c) => c !== "Kosovo");

  it("labels an empty list Worldwide", () => {
    expect(scopeFromCountries([])).toBe("Worldwide");
  });

  it("labels the candidate's country alone with its name", () => {
    expect(scopeFromCountries(["Portugal"])).toBe("Portugal");
  });

  it("joins a small list of countries", () => {
    expect(scopeFromCountries(["Poland", "Portugal", "Romania"])).toBe("Poland, Portugal, Romania");
  });

  it("labels Europe, ignoring island territories", () => {
    const territories = ["Faroe Islands", "Gibraltar", "Guernsey", "Isle of Man", "Jersey"];
    expect(scopeFromCountries(europe)).toBe("Europe");
    expect(scopeFromCountries([...europe, ...territories])).toBe("Europe");
  });

  it("labels Europe plus a few countries elsewhere", () => {
    expect(scopeFromCountries([...europe, "India", "Japan"])).toBe("Europe & more");
  });

  it("does not call Europe plus Asia and the Americas 'Europe & Americas'", () => {
    const label = scopeFromCountries([...europe, "United States", "India", "Japan", "Brazil"]);
    expect(label).toBe("Europe & more");
  });

  it("is honest for a list with Asia, Africa and the Americas", () => {
    const label = scopeFromCountries([...europe, "Nigeria", "Brazil"]);
    expect(label).toBe("Europe & more");
    expect(label.length).toBeLessThanOrEqual(40);
  });

  it("labels Europe plus the Americas", () => {
    expect(scopeFromCountries([...europe, "United States", "Canada"])).toBe("Europe & Americas");
  });

  it("labels Europe, Africa and the Middle East EMEA", () => {
    const emea = [...europe, "Nigeria", "South Africa", "Egypt", "Israel", "Saudi Arabia"];
    expect(scopeFromCountries(emea)).toBe("EMEA");
  });

  it("falls back to a short generic label for a long mixed list", () => {
    const label = scopeFromCountries(["Portugal", "Brazil", "Japan", "Chile", "Peru"]);
    expect(label).toBe("Several countries");
    expect(label.length).toBeLessThanOrEqual(40);
  });
});
