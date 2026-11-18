/**
 * Reusable Zod primitives for ISO standards used across every vertical.
 *
 * `Iso4217Currency` is intentionally regex-based rather than enum-based so
 * adapters can emit codes that aren't in the curated `reference/currencies`
 * lookup table. Consumers that need the full curated list should import
 * `CURRENCIES` from `reference/`.
 *
 * `Iso3166Alpha2` is the opposite: a *shape* check like `/^[A-Z]{2}$/` lets
 * well-formed non-codes through (`'UK'`, `'XX'`, `'ZZ'` all match it, but
 * none is a real ISO 3166-1 alpha-2 code), so it validates by *membership*
 * against every officially assigned code instead — see the code list below
 * for why that must be the full 249, not a curated subset. This is a
 * different, larger set than `reference/countries.ts`'s `COUNTRY_NAMES`,
 * which is a curated subset for UI dropdowns, not a validation surface.
 *
 * Deliberately `z.string().refine(...)`, not `z.enum(...)`: an enum's
 * inferred type is the 249-member literal union, which breaks every existing
 * assignment site typed as plain `string` across the codebase (~1,000 call
 * sites). `.refine()` keeps `z.infer<typeof Iso3166Alpha2>` as `string` while
 * still rejecting non-members at runtime on both read and write paths.
 */

import { z } from 'zod'

/** ISO 4217 currency code — three uppercase letters (e.g. USD, EUR, GBP). */
export const Iso4217Currency = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Must be a 3-letter uppercase ISO 4217 currency code (e.g. USD, EUR).')
  .describe('ISO 4217 currency code (e.g. USD, EUR, GBP).')
  .meta({ example: 'USD' })

/**
 * Every officially assigned ISO 3166-1 alpha-2 code (249 entries). A shape
 * check like `/^[A-Z]{2}$/` lets well-formed non-codes through — `'UK'`,
 * `'XX'`, `'ZZ'` all match it but none is a real ISO 3166-1 alpha-2 code
 * (the United Kingdom's code is `GB`). Membership in this list is what
 * actually validates a country code.
 *
 * The full list, not a curated subset: a partial list reintroduces the same
 * false-negative problem in a harder-to-see form (real codes silently
 * rejected). Retired/transitional codes (`AN`, `BU`, `CS`, `DD`, `SU`, `TP`,
 * `YU`, `ZR`) and user-assigned/exceptionally-reserved codes (e.g. `XK` for
 * Kosovo) are deliberately excluded — they are not officially assigned by
 * the ISO 3166 Maintenance Agency.
 */
export const ISO_3166_1_ALPHA2_CODES = [
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
] as const

const ISO_3166_1_ALPHA2_SET: ReadonlySet<string> = new Set(ISO_3166_1_ALPHA2_CODES)

/**
 * Whether `value` is one of the 249 officially assigned ISO 3166-1 alpha-2
 * codes. Exported so call sites that currently do their own ad hoc
 * shape-only check (e.g. a country-name/alias normaliser's final
 * already-alpha-2 passthrough branch) can validate by membership instead —
 * the same class of bug this schema exists to close, one layer up.
 */
export function isIso3166Alpha2(value: string): boolean {
  return ISO_3166_1_ALPHA2_SET.has(value)
}

/** ISO 3166-1 alpha-2 country code — two uppercase letters (e.g. US, GB, DE). */
export const Iso3166Alpha2 = z
  .string()
  .refine((v) => ISO_3166_1_ALPHA2_SET.has(v), {
    message:
      'Must be an assigned ISO 3166-1 alpha-2 country code (e.g. US, GB) — not merely two uppercase letters.',
  })
  .describe('ISO 3166-1 alpha-2 country code (e.g. US, GB, DE).')
  .meta({ example: 'US' })

/** ISO 8601 date-time. Strict — adapters must serialize timestamps as ISO. */
export const IsoDatetime = z.iso
  .datetime({ offset: true })
  .describe('ISO 8601 date-time (e.g. 2026-04-21T22:00:00.000Z).')
  .meta({ example: '2026-01-15T09:30:00Z' })

/**
 * Coerce an arbitrary timestamp into a strict ISO 8601 string, or
 * `undefined` when the input is missing or unparseable.
 *
 * Adapters get raw upstream payloads in many shapes: `2024-11-15T09:00:00`
 * (no timezone), `2024-11-15 09:00:00` (space separator), epoch seconds,
 * epoch millis as a string, or a Date instance. `IsoDatetime` is strict
 * (requires `Z` or `±HH:MM`) so the transform layer must normalise before
 * assigning. Use this helper at every assignment to a `createdAt` /
 * `updatedAt` / `processedAt` / etc. field.
 *
 * Numeric inputs ≤ 9_999_999_999 are treated as epoch seconds; larger as
 * epoch milliseconds. Dropping invalid dates instead of throwing matches
 * the canonical-schema contract: missing-rather-than-wrong.
 */
export function toIsoDatetime(input: unknown): string | undefined {
  if (input === null || input === undefined || input === '') return undefined
  let date: Date
  if (input instanceof Date) {
    date = input
  } else if (typeof input === 'number') {
    date = new Date(input <= 9_999_999_999 ? input * 1000 : input)
  } else if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return undefined
    // Numeric string → epoch
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed)
      date = new Date(n <= 9_999_999_999 ? n * 1000 : n)
    } else {
      // Replace space separator with T (e.g. MySQL/upstream formats)
      let normalised =
        trimmed.includes(' ') && !trimmed.includes('T') ? trimmed.replace(' ', 'T') : trimmed
      // An offset-less datetime is treated as UTC, not host-local.
      // `new Date('2019-11-27T11:40:36')` resolves in the host's zone, so the
      // same upstream value would produce a different instant on every
      // deployment.
      // Nearly every platform API that omits an offset documents UTC.
      // Date-only values are left alone — `new Date('2019-11-27')` is already
      // parsed as UTC midnight by spec.
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalised)) {
        normalised += 'Z'
      }
      date = new Date(normalised)
    }
  } else {
    return undefined
  }
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

/** ISO 8601 calendar date with no time-of-day component (e.g. 2026-04-21). */
export const IsoDate = z.iso
  .date()
  .describe('ISO 8601 calendar date (YYYY-MM-DD).')
  .meta({ example: '2026-02-01' })

/** Hex RGB colour string (e.g. #00B04F). */
export const HexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 7-character #RRGGBB hex colour.')
  .describe('Hex RGB colour (e.g. #00B04F).')
  .meta({ example: '#1D4ED8' })

/** URL-safe slug — lowercase letters, digits, hyphens (e.g. red-t-shirt). */
export const Slug = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'Must contain only lowercase letters, digits, and hyphens.')
  .describe('URL-safe slug — lowercase letters, digits, hyphens.')
  .meta({ example: 'wireless-keyboard' })

/**
 * Coerce an arbitrary upstream identifier into a `Slug`-compatible string,
 * or `undefined` when the input can't yield anything useful.
 *
 * Rules: lowercase, replace any run of non-[a-z0-9] with a single hyphen,
 * trim leading/trailing hyphens, collapse consecutive hyphens.
 */
export function toSlug(input: unknown): string | undefined {
  if (input === null || input === undefined) return undefined
  const raw = String(input).trim()
  if (!raw) return undefined
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || undefined
}

/** 24-hour wall-clock time in HH:MM (e.g. 17:00). */
export const HHMMTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be 24-hour HH:MM (e.g. 17:00).')
  .describe('24-hour wall-clock time in HH:MM.')
  .meta({ example: '17:00' })

export type Iso4217CurrencyT = z.infer<typeof Iso4217Currency>
export type Iso3166Alpha2T = z.infer<typeof Iso3166Alpha2>
