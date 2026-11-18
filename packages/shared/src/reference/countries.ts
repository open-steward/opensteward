/**
 * ISO 3166-1 alpha-2 country codes — names and regional groupings.
 *
 * Standard: ISO 3166-1:2020
 * Source: https://www.iso.org/iso-3166-country-codes.html
 */

/** ISO 3166-1 alpha-2 code → English short name */
export const COUNTRY_NAMES: Record<string, string> = {
  // Europe — Nordics
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  IS: 'Iceland',
  // Europe — DACH
  DE: 'Germany',
  AT: 'Austria',
  CH: 'Switzerland',
  // Europe — Benelux
  NL: 'Netherlands',
  BE: 'Belgium',
  LU: 'Luxembourg',
  // Europe — UK / Ireland
  GB: 'United Kingdom',
  IE: 'Ireland',
  // Europe — France
  FR: 'France',
  MC: 'Monaco',
  // Europe — Iberia
  ES: 'Spain',
  PT: 'Portugal',
  AD: 'Andorra',
  // Europe — Italy
  IT: 'Italy',
  SM: 'San Marino',
  VA: 'Vatican City',
  // Europe — Central/Eastern
  PL: 'Poland',
  CZ: 'Czechia',
  SK: 'Slovakia',
  HU: 'Hungary',
  RO: 'Romania',
  BG: 'Bulgaria',
  SI: 'Slovenia',
  HR: 'Croatia',
  RS: 'Serbia',
  BA: 'Bosnia and Herzegovina',
  ME: 'Montenegro',
  MK: 'North Macedonia',
  AL: 'Albania',
  XK: 'Kosovo',
  // Europe — Baltics
  EE: 'Estonia',
  LV: 'Latvia',
  LT: 'Lithuania',
  // Europe — Other
  GR: 'Greece',
  CY: 'Cyprus',
  MT: 'Malta',
  // Eastern Europe
  UA: 'Ukraine',
  MD: 'Moldova',
  BY: 'Belarus',
  RU: 'Russia',
  // Turkey
  TR: 'Turkey',
  // North America
  US: 'United States',
  CA: 'Canada',
  MX: 'Mexico',
  // Central America & Caribbean
  GT: 'Guatemala',
  HN: 'Honduras',
  SV: 'El Salvador',
  NI: 'Nicaragua',
  CR: 'Costa Rica',
  PA: 'Panama',
  JM: 'Jamaica',
  TT: 'Trinidad and Tobago',
  // South America
  BR: 'Brazil',
  AR: 'Argentina',
  CL: 'Chile',
  CO: 'Colombia',
  PE: 'Peru',
  VE: 'Venezuela',
  EC: 'Ecuador',
  UY: 'Uruguay',
  PY: 'Paraguay',
  BO: 'Bolivia',
  // Asia — East
  CN: 'China',
  JP: 'Japan',
  KR: 'South Korea',
  KP: 'North Korea',
  TW: 'Taiwan',
  HK: 'Hong Kong',
  MO: 'Macau',
  MN: 'Mongolia',
  // Asia — Southeast
  SG: 'Singapore',
  MY: 'Malaysia',
  TH: 'Thailand',
  VN: 'Vietnam',
  ID: 'Indonesia',
  PH: 'Philippines',
  MM: 'Myanmar',
  KH: 'Cambodia',
  LA: 'Laos',
  BN: 'Brunei',
  // Asia — South
  IN: 'India',
  PK: 'Pakistan',
  BD: 'Bangladesh',
  LK: 'Sri Lanka',
  NP: 'Nepal',
  // Asia — Central
  KZ: 'Kazakhstan',
  UZ: 'Uzbekistan',
  KG: 'Kyrgyzstan',
  TJ: 'Tajikistan',
  TM: 'Turkmenistan',
  // Middle East
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  OM: 'Oman',
  JO: 'Jordan',
  LB: 'Lebanon',
  IL: 'Israel',
  IQ: 'Iraq',
  IR: 'Iran',
  YE: 'Yemen',
  SY: 'Syria',
  PS: 'Palestine',
  // Africa — North
  EG: 'Egypt',
  MA: 'Morocco',
  TN: 'Tunisia',
  DZ: 'Algeria',
  LY: 'Libya',
  // Africa — West
  NG: 'Nigeria',
  GH: 'Ghana',
  SN: 'Senegal',
  CI: "Côte d'Ivoire",
  // Africa — East
  KE: 'Kenya',
  TZ: 'Tanzania',
  UG: 'Uganda',
  ET: 'Ethiopia',
  RW: 'Rwanda',
  // Africa — South
  ZA: 'South Africa',
  BW: 'Botswana',
  NA: 'Namibia',
  ZW: 'Zimbabwe',
  // Oceania
  AU: 'Australia',
  NZ: 'New Zealand',
  FJ: 'Fiji',
  PG: 'Papua New Guinea',
}

/**
 * ISO 3166-1 alpha-2 code → region group.
 * Used for grouping providers by geographic region.
 */
export const COUNTRY_REGIONS: Record<string, string> = {
  // Nordics
  SE: 'Nordics',
  NO: 'Nordics',
  DK: 'Nordics',
  FI: 'Nordics',
  IS: 'Nordics',
  // DACH
  DE: 'DACH',
  AT: 'DACH',
  CH: 'DACH',
  // Benelux
  NL: 'Benelux',
  BE: 'Benelux',
  LU: 'Benelux',
  // UK / Ireland
  GB: 'UK / Ireland',
  IE: 'UK / Ireland',
  // Western Europe
  FR: 'France',
  ES: 'Spain',
  PT: 'Portugal',
  IT: 'Italy',
  // Central/Eastern Europe
  PL: 'Poland',
  CZ: 'Czechia / Slovakia',
  SK: 'Czechia / Slovakia',
  HU: 'Romania / Hungary',
  RO: 'Romania / Hungary',
  BG: 'Central / Eastern Europe',
  SI: 'Central / Eastern Europe',
  HR: 'Central / Eastern Europe',
  RS: 'Central / Eastern Europe',
  // Baltics
  EE: 'Baltics',
  LV: 'Baltics',
  LT: 'Baltics',
  // Other Europe
  GR: 'Greece',
  TR: 'Turkey',
  CY: 'Greece',
  // Eastern Europe
  UA: 'Ukraine',
  RU: 'Russia',
  BY: 'Russia',
  MD: 'Ukraine',
  // North America
  US: 'North America',
  CA: 'North America',
  // LATAM
  MX: 'LATAM',
  BR: 'LATAM',
  AR: 'LATAM',
  CL: 'LATAM',
  CO: 'LATAM',
  PE: 'LATAM',
  VE: 'LATAM',
  EC: 'LATAM',
  UY: 'LATAM',
  PY: 'LATAM',
  BO: 'LATAM',
  GT: 'LATAM',
  HN: 'LATAM',
  CR: 'LATAM',
  PA: 'LATAM',
  // APAC
  CN: 'APAC',
  JP: 'APAC',
  KR: 'APAC',
  TW: 'APAC',
  HK: 'APAC',
  SG: 'APAC',
  MY: 'APAC',
  TH: 'APAC',
  VN: 'APAC',
  ID: 'APAC',
  PH: 'APAC',
  IN: 'APAC',
  PK: 'APAC',
  BD: 'APAC',
  AU: 'APAC',
  NZ: 'APAC',
  // Africa
  NG: 'Africa',
  KE: 'Africa',
  ZA: 'Africa',
  GH: 'Africa',
  TZ: 'Africa',
  UG: 'Africa',
  ET: 'Africa',
  RW: 'Africa',
  // MENA
  AE: 'MENA',
  SA: 'MENA',
  QA: 'MENA',
  KW: 'MENA',
  BH: 'MENA',
  OM: 'MENA',
  JO: 'MENA',
  LB: 'MENA',
  IL: 'MENA',
  EG: 'MENA',
  MA: 'MENA',
  TN: 'MENA',
  DZ: 'MENA',
  IQ: 'MENA',
  IR: 'MENA',
}

/**
 * `COUNTRY_NAMES` as a list of `{ code, name }`, sorted alphabetically by
 * English name — ready to render as `<option value={code}>{name}</option>`
 * in a single-select. The stored/submitted value stays the ISO alpha-2
 * code, so backends keep validating against {@link COUNTRY_NAMES} keys.
 */
export const COUNTRY_OPTIONS: ReadonlyArray<{ code: string; name: string }> = Object.entries(
  COUNTRY_NAMES,
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name))
