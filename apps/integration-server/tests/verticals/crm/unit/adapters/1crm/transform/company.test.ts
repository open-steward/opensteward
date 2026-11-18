import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type Raw1CrmAccount,
} from '../../../../../../../src/verticals/crm/adapters/1crm/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<Raw1CrmAccount> = {}): Raw1CrmAccount {
  return { id: 'acc-1', ...overrides }
}

describe('1crm transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 'acc-42' })).id).toBe('acc-42')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme Corp' })).name).toBe('Acme Corp')
  })

  it('extracts hostname from website, strips www prefix', () => {
    const result = transformCompany(makeRaw({ website: 'https://www.acme.com' }))
    expect(result.domain).toBe('acme.com')
  })

  it('extracts hostname from website without www', () => {
    const result = transformCompany(makeRaw({ website: 'https://acme.com' }))
    expect(result.domain).toBe('acme.com')
  })

  it('falls back to raw website string when URL parse fails', () => {
    const result = transformCompany(makeRaw({ website: 'not-a-url' }))
    expect(result.domain).toBe('not-a-url')
  })

  it('maps phone_office to phone', () => {
    expect(transformCompany(makeRaw({ phone_office: '+14155550123' })).phone).toBe('+14155550123')
  })

  it('parses employees string to integer size', () => {
    expect(transformCompany(makeRaw({ employees: '350' })).size).toBe(350)
  })

  it('handles numeric employees', () => {
    expect(transformCompany(makeRaw({ employees: 100 })).size).toBe(100)
  })

  it('maps assigned_user_id to owner_id', () => {
    expect(transformCompany(makeRaw({ assigned_user_id: 'u-5' })).owner_id).toBe('u-5')
  })

  it('only includes ISO 3166-1 alpha-2 country codes', () => {
    const withAlpha2 = transformCompany(
      makeRaw({ billing_address_country: 'US', billing_address_city: 'NYC' }),
    )
    expect(withAlpha2.address?.country).toBe('US')

    const withFullName = transformCompany(
      makeRaw({ billing_address_country: 'United States', billing_address_city: 'NYC' }),
    )
    expect(withFullName.address?.country).toBeUndefined()
  })

  it('rejects a well-formed but non-assigned two-letter code, rather than passing it through', () => {
    // 'XK' is two letters but is not an officially assigned ISO 3166-1
    // alpha-2 code (it's user-assigned, for Kosovo) — a shape-only check
    // would incorrectly let it through unchanged.
    const withNonCode = transformCompany(
      makeRaw({ billing_address_country: 'XK', billing_address_city: 'Pristina' }),
    )
    expect(withNonCode.address?.country).toBeUndefined()
  })

  it('returns undefined address when all fields absent', () => {
    expect(transformCompany(makeRaw()).address).toBeUndefined()
  })

  it('converts timestamps to ISO', () => {
    const result = transformCompany(
      makeRaw({
        date_entered: '2026-01-15T09:30:00Z',
        date_modified: '2026-02-01T14:20:00Z',
      }),
    )
    expect(result.created_at).toMatch(/2026-01-15/)
    expect(result.updated_at).toMatch(/2026-02-01/)
  })

  it('passes CompanySchema.parse without throwing', () => {
    const raw = makeRaw({
      name: 'Acme Industries',
      website: 'https://acme.com',
      phone_office: '+14155550123',
      industry: 'Manufacturing',
      employees: 350,
      assigned_user_id: 'u-1',
      billing_address_street: '123 Main St',
      billing_address_city: 'New York',
      billing_address_state: 'NY',
      billing_address_postalcode: '10001',
      billing_address_country: 'US',
      date_entered: '2026-01-01T00:00:00Z',
      date_modified: '2026-01-02T00:00:00Z',
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('1crm untransformCompany', () => {
  it('maps name back', () => {
    expect(untransformCompany({ name: 'Acme' }).name).toBe('Acme')
  })

  it('maps phone back to phone_office', () => {
    expect(untransformCompany({ phone: '+1234567890' }).phone_office).toBe('+1234567890')
  })

  it('maps domain to website with https prefix', () => {
    expect(untransformCompany({ domain: 'acme.com' }).website).toBe('https://acme.com')
  })

  it('maps size back to employees', () => {
    expect(untransformCompany({ size: 500 }).employees).toBe(500)
  })

  it('round-trips company name/phone/domain', () => {
    const raw = makeRaw({
      name: 'Round Trip Co',
      phone_office: '+15555551234',
      website: 'https://roundtrip.com',
    })
    const canonical = transformCompany(raw)
    const back = untransformCompany(canonical)
    expect(back.name).toBe('Round Trip Co')
    expect(back.phone_office).toBe('+15555551234')
    expect(back.website).toBe('https://roundtrip.com')
  })
})
