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
export const COUNTRY_ALIASES: Record<string, string[]> = {
  "United Kingdom": ["uk", "great britain", "britain", "england"],
  Czechia: ["czech republic"],
  Netherlands: ["the netherlands", "holland"],
  "United States": ["usa", "us", "u.s.", "u.s.a.", "united states of america"],
};

const WORLDWIDE_WORD = /\b(worldwide|world wide|anywhere|global|globally)\b/;
const EMEA = /\bemea\b/;
const EU_UNION = /\b(eu|european union)\b/;
const EEA = /\beea\b/;
const EUROPE = /\b(europe|european)\b/;
// A Central/Eastern European timezone requirement keeps the job inside Europe.
const EUROPEAN_TIMEZONE = /\b(cet|cest|eet|eest)\b/;
const AMERICAS =
  /\b(americas|latam|latin america|north america|south america|usa|united states|us|canada|brazil|mexico)\b/;
const ASIA_PACIFIC = /\b(apac|asia|asia pacific|oceania|australia|india|china|japan)\b/;
const AFRICA_MIDDLE_EAST = /\b(africa|mena|middle east)\b/;
// Sub-regions of Europe that do not include a candidate by default: "Eastern Europe" does not
// mean Portugal. Naming the candidate's own country still makes the job eligible.
const EUROPE_SUBREGION =
  /\b((central and eastern|central & eastern|central|eastern|northern) europe|cee|nordics?|scandinavia|dach|benelux|balkans?|baltics?)\b/g;
// "Anywhere in the world" is worldwide; "anywhere in the US" is not.
const ANYWHERE_IN_WORLD = /\b(anywhere|global|globally)\s+(in|across|around)\s+the\s+world\b/g;
const WORLDWIDE_PLACE = new RegExp(
  `${WORLDWIDE_WORD.source}\\s*(in|within|across|from|inside)\\s+(the\\s+)?`,
  "g",
);
// "Global (US only)", "worldwide, based in the US": the place decides, not the worldwide word.
const RESIDENCE_QUALIFIER =
  /\b(based in|located in|residents? of|resident in|residing in|living in|must be (located |based |living |resident )?in)\b/;
const ONLY_QUALIFIER = /(?<!remote )\b(only|exclusively)\b/;
const EXCLUSION = /\b(except|excluding|excl\.?|not including|other than|outside of|outside)\b/;

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

/** An unqualified worldwide marker ("Worldwide", "Anywhere in the world", "Global"). */
function isWorldwide(t: string): boolean {
  const plain = t.replace(ANYWHERE_IN_WORLD, "worldwide");
  if (!WORLDWIDE_WORD.test(plain.replace(WORLDWIDE_PLACE, " "))) return false;
  return !ONLY_QUALIFIER.test(plain) && !RESIDENCE_QUALIFIER.test(plain);
}

const TZ_OFFSET = /\b(utc|gmt|cet|cest)\s*(\+\/-|\+-|[+\-−±])\s*(\d{1,2})\b/g;

/** Whether the UTC offsets named in the text (a point or a range) include Portugal's: 0 or +1. */
function offsetsReachPortugal(t: string): boolean {
  const points: number[] = [];
  let range: [number, number] | null = null;
  for (const m of t.matchAll(TZ_OFFSET)) {
    const base = m[1] === "utc" || m[1] === "gmt" ? 0 : m[1] === "cet" ? 1 : 2;
    const n = Number(m[3]);
    if (m[2] === "+/-" || m[2] === "+-" || m[2] === "±") range = [base - n, base + n];
    else points.push(base + (m[2] === "+" ? n : -n));
  }
  if (!range && points.length > 0) range = [Math.min(...points), Math.max(...points)];
  return range !== null && range[0] <= 1 && range[1] >= 0;
}

/** Time zones around Portugal's (GMT/WET, UTC+0, a range reaching it) and Iberia. */
function compatibleTimezone(t: string): boolean {
  if (/\b(iberia|iberian|gmt|wet)\b/.test(t)) return true;
  if (/\buk (time ?zones?|hours)\b/.test(t)) return true;
  if (/\butc\b(?!\s*(\+\/-|\+-|[+\-−±]))/.test(t)) return true;
  return offsetsReachPortugal(t);
}

/** Eligibility from countries, regions and time zones alone (no worldwide marker). */
function eligibleByPlace(t: string, country: string): boolean {
  if (mentionsCountry(t, country)) return true;
  if (!isIn(EUROPE_COUNTRIES, country)) return false;
  const r = t.replace(EUROPE_SUBREGION, " ");
  if (EMEA.test(r) || EUROPE.test(r) || EUROPEAN_TIMEZONE.test(r)) return true;
  if (EEA.test(r) && isIn(EEA_COUNTRIES, country)) return true;
  if (EU_UNION.test(r) && isIn(EU_COUNTRIES, country)) return true;
  return compatibleTimezone(r);
}

export function isEligibleLocation(text: string, country: string): boolean {
  let t = normalize(text);
  if (!t) return false;
  // "Worldwide except Europe", "Europe excluding Portugal": what follows the keyword is out.
  // Excluding the candidate's own area rejects; excluding other places changes nothing.
  const exc = EXCLUSION.exec(t);
  if (exc) {
    if (eligibleByPlace(t.slice(exc.index + exc[0].length), country)) return false;
    t = t.slice(0, exc.index).trim();
    if (!t) return false;
  }
  return isWorldwide(t) || eligibleByPlace(t, country);
}

const MAX_LABEL = 40;

/** Whether the text names a region (worldwide, Europe, EMEA, EU, EEA) rather than just countries. */
export function mentionsRegion(text: string): boolean {
  const t = normalize(text);
  return (
    WORLDWIDE_WORD.test(t) || EMEA.test(t) || EU_UNION.test(t) || EEA.test(t) || EUROPE.test(t)
  );
}

/** Short display label for a "who may apply" text: "Worldwide", "Europe", "Portugal", ... */
export function scopeLabel(text: string): string {
  const t = normalize(text);
  if (isWorldwide(t)) return "Worldwide";
  const region = EMEA.test(t)
    ? "EMEA"
    : EU_UNION.test(t)
      ? "EU"
      : EEA.test(t)
        ? "EEA"
        : EUROPE.test(t) || EUROPEAN_TIMEZONE.test(t)
          ? "Europe"
          : null;
  if (region) {
    // Say so when the text reaches beyond the region (never understate where it is open).
    const beyond = ASIA_PACIFIC.test(t) || (region !== "EMEA" && AFRICA_MIDDLE_EAST.test(t));
    if (beyond) return `${region} & more`;
    return AMERICAS.test(t) ? `${region} & Americas` : region;
  }
  const countries = EUROPE_COUNTRIES.filter((c) => mentionsCountry(t, c));
  if (countries.length === 1) return countries[0];
  return text.trim().slice(0, MAX_LABEL).trim();
}

/** Island territories that sit in a "Europe" list without changing what it means. */
const EUROPEAN_TERRITORIES = [
  "Faroe Islands",
  "Gibraltar",
  "Guernsey",
  "Holy See (Vatican City State)",
  "Isle of Man",
  "Jersey",
  "Svalbard and Jan Mayen",
  "Åland Islands",
];
// Countries outside Europe, to tell "Europe & Americas" and "EMEA" from "Europe & more". A country
// missing here only makes the label vaguer ("Europe & more"), never wrong.
const AMERICAS_COUNTRIES = [
  "United States",
  "Canada",
  "Mexico",
  "Brazil",
  "Argentina",
  "Chile",
  "Colombia",
  "Peru",
  "Uruguay",
  "Paraguay",
  "Bolivia",
  "Ecuador",
  "Venezuela",
  "Costa Rica",
  "Panama",
  "Guatemala",
  "Dominican Republic",
  "Puerto Rico",
  "Jamaica",
  "El Salvador",
  "Honduras",
  "Nicaragua",
  "Cuba",
  "Trinidad and Tobago",
  "Bahamas",
  "Barbados",
];
const AFRICA_MIDDLE_EAST_COUNTRIES = [
  "Nigeria",
  "South Africa",
  "Egypt",
  "Kenya",
  "Morocco",
  "Ghana",
  "Tunisia",
  "Algeria",
  "Ethiopia",
  "Tanzania",
  "Uganda",
  "Rwanda",
  "Senegal",
  "Cameroon",
  "Zimbabwe",
  "Zambia",
  "Namibia",
  "Botswana",
  "Mauritius",
  "Israel",
  "Saudi Arabia",
  "United Arab Emirates",
  "UAE",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Jordan",
  "Lebanon",
  "Turkey",
  "Türkiye",
  "Iraq",
];
const MAX_LISTED_COUNTRIES = 3;
// A list counts as "all of Europe" when it covers this share of EUROPE_COUNTRIES.
const EUROPE_COVERAGE = 0.65;

/**
 * Display label for a structured country list (Himalayas' locationRestrictions; empty means
 * worldwide): "Worldwide", "Europe", "EMEA", "Europe & Americas", "Europe & more", the
 * country names for a short list, or "Several countries".
 */
export function scopeFromCountries(countries: readonly string[]): string {
  if (countries.length === 0) return "Worldwide";
  const names = new Set(countries.map(normalize));
  const has = (c: string) => names.has(normalize(c));
  const covered = EUROPE_COUNTRIES.filter(has).length;
  if (covered / EUROPE_COUNTRIES.length >= EUROPE_COVERAGE) {
    const others = countries.filter(
      (c) => !isIn(EUROPE_COUNTRIES, c) && !isIn(EUROPEAN_TERRITORIES, c),
    );
    if (others.length === 0) return "Europe";
    if (others.every((c) => isIn(AMERICAS_COUNTRIES, c))) return "Europe & Americas";
    if (others.every((c) => isIn(AFRICA_MIDDLE_EAST_COUNTRIES, c))) return "EMEA";
    return "Europe & more";
  }
  if (countries.length <= MAX_LISTED_COUNTRIES) return countries.join(", ");
  return "Several countries";
}
