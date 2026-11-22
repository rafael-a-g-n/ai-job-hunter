/**
 * Whether a free-text "who may apply" field (Remotive's candidate_required_location and similar)
 * lets a candidate living in a given country take the job. Conservative: unknown or empty text
 * is not eligible.
 */

export const EU_COUNTRIES = [
  "Austria",
  "Belgium",
  "Bulgaria",
  "Croatia",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Ireland",
  "Italy",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Netherlands",
  "Poland",
  "Portugal",
  "Romania",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
] as const;

/** EU plus the other EEA members. */
export const EEA_COUNTRIES = [...EU_COUNTRIES, "Iceland", "Liechtenstein", "Norway"] as const;

/** EEA plus the United Kingdom, Switzerland and the other European countries. */
export const EUROPE_COUNTRIES = [
  ...EEA_COUNTRIES,
  "United Kingdom",
  "Switzerland",
  "Albania",
  "Andorra",
  "Belarus",
  "Bosnia and Herzegovina",
  "Kosovo",
  "Moldova",
  "Monaco",
  "Montenegro",
  "North Macedonia",
  "San Marino",
  "Serbia",
  "Ukraine",
  "Vatican City",
] as const;

/** Other names a country goes by in job postings. */
const COUNTRY_ALIASES: Record<string, string[]> = {
  "United Kingdom": ["uk", "great britain", "britain", "england"],
  Czechia: ["czech republic"],
  Netherlands: ["the netherlands", "holland"],
  "United States": ["usa", "us", "u.s.", "u.s.a.", "united states of america"],
};

const WORLDWIDE = /\b(worldwide|world wide|anywhere|global|globally)\b/;
const EMEA = /\bemea\b/;
const EU_UNION = /\b(eu|european union)\b/;
const EEA = /\beea\b/;
const EUROPE = /\b(europe|european)\b/;
// A Central/Eastern European timezone requirement keeps the job inside Europe.
const EUROPEAN_TIMEZONE = /\b(cet|cest|eet|eest)\b/;
const AMERICAS = /\bamericas\b/;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lowercase names (canonical first, then aliases) of a country. */
function namesOf(country: string): string[] {
  const canonical = normalize(country);
  const aliases = (COUNTRY_ALIASES[country] ?? []).map(normalize);
  return [canonical, ...aliases];
}

function mentions(text: string, name: string): boolean {
  return new RegExp(`(?<![a-z])${escapeRegExp(name)}(?![a-z])`).test(text);
}

function mentionsCountry(text: string, country: string): boolean {
  return namesOf(country).some((n) => mentions(text, n));
}

const isIn = (list: readonly string[], country: string) =>
  list.some((c) => normalize(c) === normalize(country));

export function isEligibleLocation(text: string, country: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  if (WORLDWIDE.test(t)) return true;
  if (mentionsCountry(t, country)) return true;
  if (isIn(EUROPE_COUNTRIES, country)) {
    if (EMEA.test(t) || EUROPE.test(t) || EUROPEAN_TIMEZONE.test(t)) return true;
    if (EEA.test(t) && isIn(EEA_COUNTRIES, country)) return true;
    if (EU_UNION.test(t) && isIn(EU_COUNTRIES, country)) return true;
  }
  return false;
}

const MAX_LABEL = 40;

/** Short display label for a "who may apply" text: "Worldwide", "Europe", "Portugal", ... */
export function scopeLabel(text: string): string {
  const t = normalize(text);
  if (WORLDWIDE.test(t)) return "Worldwide";
  const region = EMEA.test(t)
    ? "EMEA"
    : EU_UNION.test(t)
      ? "EU"
      : EEA.test(t)
        ? "EEA"
        : EUROPE.test(t) || EUROPEAN_TIMEZONE.test(t)
          ? "Europe"
          : null;
  if (region) return region !== "EMEA" && AMERICAS.test(t) ? `${region} & Americas` : region;
  const countries = EUROPE_COUNTRIES.filter((c) => mentionsCountry(t, c));
  if (countries.length === 1) return countries[0];
  return text.trim().slice(0, MAX_LABEL).trim();
}
