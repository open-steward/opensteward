/**
 * Normaliser for country values that a canonical schema requires as a strict
 * ISO 3166-1 alpha-2 code but that platforms emit loosely — full names,
 * alpha-3 codes, or non-standard two-letter aliases like `"UK"`.
 *
 * Deliberately IDEMPOTENT: passing an already-canonical value returns it
 * unchanged. That is what makes it safe to apply to an adapter whose
 * upstream shape you cannot confirm — normalising a value the platform
 * already sends correctly is a no-op, whereas editing a test fixture to
 * match a broken transform silently preserves the bug.
 *
 * Returns `undefined` rather than guessing. A wrong country code is worse
 * than an absent one: the canonical field is `nullish()`, so `undefined` is
 * valid and honest, while a guess is silently wrong data.
 *
 * There is deliberately no `toIsoDatetime` in this file. That helper already
 * exists at `@opensteward/shared` (`packages/shared/src/schemas/iso.ts`) and
 * is already used by ~1,000 transforms across 8 verticals, including
 * `accounting/adapters/kashflow/`. Import it from there — do not reintroduce
 * a second implementation here.
 *
 * The "already alpha-2" passthrough below validates by *membership* against
 * `isIso3166Alpha2` (`@opensteward/shared`), not by shape. A bare
 * `/^[A-Za-z]{2}$/` check would let well-formed non-codes through unchanged
 * — `'XK'`, `'EU'`, `'AN'`, `'ZZ'` are all two letters but none is an
 * officially assigned ISO 3166-1 alpha-2 code — which is the exact defect
 * this helper exists to normalise away, one layer up.
 */

import { isIso3166Alpha2 } from '@opensteward/shared'

/** Full name (and common alternates) -> ISO 3166-1 alpha-2. Lowercased keys. */
const COUNTRY_NAME_TO_ALPHA2: Record<string, string> = {
  afghanistan: 'AF', albania: 'AL', algeria: 'DZ', argentina: 'AR', australia: 'AU',
  austria: 'AT', bangladesh: 'BD', belgium: 'BE', brazil: 'BR', bulgaria: 'BG',
  canada: 'CA', chile: 'CL', china: 'CN', colombia: 'CO', croatia: 'HR',
  czechia: 'CZ', 'czech republic': 'CZ', denmark: 'DK', egypt: 'EG', estonia: 'EE',
  finland: 'FI', france: 'FR', germany: 'DE', greece: 'GR', 'hong kong': 'HK',
  hungary: 'HU', iceland: 'IS', india: 'IN', indonesia: 'ID', ireland: 'IE',
  israel: 'IL', italy: 'IT', japan: 'JP', kenya: 'KE', latvia: 'LV',
  lithuania: 'LT', luxembourg: 'LU', malaysia: 'MY', mexico: 'MX', morocco: 'MA',
  netherlands: 'NL', 'the netherlands': 'NL', 'new zealand': 'NZ', nigeria: 'NG',
  norway: 'NO', pakistan: 'PK', peru: 'PE', philippines: 'PH', poland: 'PL',
  portugal: 'PT', romania: 'RO', russia: 'RU', 'russian federation': 'RU',
  'saudi arabia': 'SA', singapore: 'SG', slovakia: 'SK', slovenia: 'SI',
  'south africa': 'ZA', 'south korea': 'KR', 'korea, republic of': 'KR',
  spain: 'ES', sweden: 'SE', switzerland: 'CH', taiwan: 'TW', thailand: 'TH',
  turkey: 'TR', türkiye: 'TR', ukraine: 'UA', 'united arab emirates': 'AE',
  'united kingdom': 'GB', 'great britain': 'GB', uk: 'GB',
  'united states': 'US', 'united states of america': 'US', usa: 'US',
  vietnam: 'VN', 'viet nam': 'VN',
}

/** ISO 3166-1 alpha-3 -> alpha-2, for platforms that send three-letter codes. */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  ARE: 'AE', ARG: 'AR', AUS: 'AU', AUT: 'AT', BEL: 'BE', BGR: 'BG', BRA: 'BR',
  CAN: 'CA', CHE: 'CH', CHL: 'CL', CHN: 'CN', COL: 'CO', CZE: 'CZ', DEU: 'DE',
  DNK: 'DK', EGY: 'EG', ESP: 'ES', EST: 'EE', FIN: 'FI', FRA: 'FR', GBR: 'GB',
  GRC: 'GR', HKG: 'HK', HRV: 'HR', HUN: 'HU', IDN: 'ID', IND: 'IN', IRL: 'IE',
  ISL: 'IS', ISR: 'IL', ITA: 'IT', JPN: 'JP', KEN: 'KE', KOR: 'KR', LTU: 'LT',
  LUX: 'LU', LVA: 'LV', MAR: 'MA', MEX: 'MX', MYS: 'MY', NGA: 'NG', NLD: 'NL',
  NOR: 'NO', NZL: 'NZ', PAK: 'PK', PER: 'PE', PHL: 'PH', POL: 'PL', PRT: 'PT',
  ROU: 'RO', RUS: 'RU', SAU: 'SA', SGP: 'SG', SVK: 'SK', SVN: 'SI', SWE: 'SE',
  THA: 'TH', TUR: 'TR', TWN: 'TW', UKR: 'UA', USA: 'US', VNM: 'VN', ZAF: 'ZA',
}

export function toIso3166Alpha2(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined

  // Known aliases first. Some, like "uk", are two letters but are not
  // themselves valid ISO 3166-1 alpha-2 codes — checking the map before the
  // raw two-letter passthrough below is what stops an alias resolving to
  // itself (e.g. "uk" -> "UK") instead of to the real code ("uk" -> "GB").
  const byName = COUNTRY_NAME_TO_ALPHA2[trimmed.toLowerCase()]
  if (byName) return byName

  // Already alpha-2 — but only if it's a real, officially assigned code.
  // Shape alone ('XK', 'EU', 'AN', 'ZZ' are all two letters) is not enough.
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase()
    if (isIso3166Alpha2(upper)) return upper
  }

  // Alpha-3.
  if (/^[A-Za-z]{3}$/.test(trimmed)) return ALPHA3_TO_ALPHA2[trimmed.toUpperCase()]

  return undefined
}
