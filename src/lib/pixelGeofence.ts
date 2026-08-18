/*
  Which visitors the Meta Pixel is not allowed to load for without asking
  first.

  ISO 3166-1 alpha-2. The 27 EU member states, the UK, and the rest of the
  EEA (Iceland, Liechtenstein, Norway) - the EEA follows the same
  ePrivacy-style prior-consent rule for non-essential cookies via the EEA
  agreement, even though none of the three are in the EU.

  See functions/_middleware.ts, the only place this is used: it strips the
  pixel entirely from the response for anyone in this set, before their
  browser ever sees it, rather than loading it and asking permission after
  the fact.
*/
export const CONSENT_REQUIRED_COUNTRIES: ReadonlySet<string> = new Set([
  // EU-27
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK',
  // UK
  'GB',
  // Rest of the EEA
  'IS', 'LI', 'NO',
]);

/** @param country ISO 3166-1 alpha-2, e.g. from Cloudflare's request.cf.country. */
export function countryRequiresConsent(country: string | undefined | null): boolean {
  return Boolean(country) && CONSENT_REQUIRED_COUNTRIES.has(country!.toUpperCase());
}
