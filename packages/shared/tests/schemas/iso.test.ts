import { describe, it, expect } from 'vitest'

import { toIsoDatetime, Iso3166Alpha2 } from '../../src'

describe('Iso3166Alpha2', () => {
  it('accepts real alpha-2 codes', () => {
    for (const c of ['US', 'GB', 'DE', 'IN', 'CN', 'RU']) {
      expect(() => Iso3166Alpha2.parse(c)).not.toThrow()
    }
  })

  it('rejects well-formed values that are not real codes', () => {
    for (const c of ['XX', 'ZZ', 'QQ']) {
      expect(() => Iso3166Alpha2.parse(c)).toThrow()
    }
  })

  it('rejects UK, which is not an ISO 3166-1 alpha-2 code (GB is)', () => {
    expect(() => Iso3166Alpha2.parse('UK')).toThrow()
    expect(() => Iso3166Alpha2.parse('GB')).not.toThrow()
  })

  it('still rejects wrong-shaped input', () => {
    for (const c of ['usa', 'U', 'USA', '', 'U1']) {
      expect(() => Iso3166Alpha2.parse(c)).toThrow()
    }
  })

  it('accepts every one of the 249 officially assigned codes', () => {
    const codes = [
      'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
      'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
      'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
      'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
      'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
      'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
      'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
      'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
      'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
      'JE', 'JM', 'JO', 'JP',
      'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
      'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
      'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
      'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
      'OM',
      'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
      'QA',
      'RE', 'RO', 'RS', 'RU', 'RW',
      'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
      'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
      'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
      'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
      'WF', 'WS',
      'YE', 'YT',
      'ZA', 'ZM', 'ZW',
    ]
    expect(codes).toHaveLength(249)
    for (const c of codes) {
      expect(() => Iso3166Alpha2.parse(c)).not.toThrow()
    }
  })

  it('rejects XK, which is a user-assigned code (Kosovo) and not officially ISO-assigned', () => {
    expect(() => Iso3166Alpha2.parse('XK')).toThrow()
  })

  it('keeps the description and example metadata', () => {
    expect(Iso3166Alpha2.description).toBe('ISO 3166-1 alpha-2 country code (e.g. US, GB, DE).')
    expect(Iso3166Alpha2.meta()).toMatchObject({ example: 'US' })
  })
})

describe('toIsoDatetime — offset-less input is UTC', () => {
  it('treats a space-separated offset-less datetime as UTC', () => {
    expect(toIsoDatetime('2019-11-27 11:40:36')).toBe('2019-11-27T11:40:36.000Z')
  })

  it('treats a T-separated offset-less datetime as UTC', () => {
    expect(toIsoDatetime('2019-11-27T11:40:36')).toBe('2019-11-27T11:40:36.000Z')
  })

  it('leaves an explicit Z alone', () => {
    expect(toIsoDatetime('2019-11-27T11:40:36Z')).toBe('2019-11-27T11:40:36.000Z')
  })

  it('honours an explicit offset rather than overriding it', () => {
    expect(toIsoDatetime('2019-11-27T11:40:36+05:00')).toBe('2019-11-27T06:40:36.000Z')
  })

  it('still widens a date-only value to midnight UTC', () => {
    expect(toIsoDatetime('2019-11-27')).toBe('2019-11-27T00:00:00.000Z')
  })

  it('still rejects a calendar-impossible date', () => {
    expect(toIsoDatetime('2025-13-45')).toBeUndefined()
  })
})
