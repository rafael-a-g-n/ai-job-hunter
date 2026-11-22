import { COUNTRY_ALIASES, EUROPE_COUNTRIES } from "./eligibility";

/** Codes the ICU region list holds that are not countries (groupings, reserved codes). */
const NOT_COUNTRIES = new Set([
  "AC",
  "CP",
  "DG",
  "EA",
  "EU",
  "EZ",
  "IC",
  "QO",
  "TA",
  "UN",
  "XA",
  "XB",
  "ZZ",
]);

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();

/** Normalised name -> standard English name. Europe's names come from EUROPE_COUNTRIES. */
function buildLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      const name = names.of(code);
      if (name && name !== code && name !== "Unknown Region") lookup.set(strip(name), name);
    }
  }
  for (const c of EUROPE_COUNTRIES) lookup.set(strip(c), c);
  for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
    for (const alias of aliases) lookup.set(strip(alias), canonical);
  }
  // Names people type that neither ICU nor the alias table carry.
  const extra: Record<string, string> = {
    america: "United States",
    turkey: "Türkiye",
    "south korea": "South Korea",
    "ivory coast": "Côte d’Ivoire",
  };
  for (const [alias, canonical] of Object.entries(extra)) {
    lookup.set(strip(alias), lookup.get(strip(canonical)) ?? canonical);
  }
  return lookup;
}

let lookup: Map<string, string> | undefined;

/**
 * The standard English name of a country as typed ("czech republic" -> "Czechia", "UK" ->
 * "United Kingdom", "USA" -> "United States"), or null when it is not a known country name.
 */
export function canonicalCountry(input: string): string | null {
  lookup ??= buildLookup();
  return lookup.get(strip(input)) ?? null;
}
