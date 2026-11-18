import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawAcceloCompany,
} from '../../../../../../../src/verticals/crm/adapters/accelo/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawAcceloCompany> = {}): RawAcceloCompany {
  return { id: 'co-1', ...overrides }
}

describe('accelo transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme Corp' })).name).toBe('Acme Corp')
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw({ phone: '+14155550123' })).phone).toBe('+14155550123')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'acme.com' })).domain).toBe('acme.com')
  })

  it('parses numeric size', () => {
    expect(transformCompany(makeRaw({ size: 250 })).size).toBe(250)
  })

  it('parses string size', () => {
    expect(transformCompany(makeRaw({ size: '500' })).size).toBe(500)
  })

  it('returns undefined size for NaN string', () => {
    expect(transformCompany(makeRaw({ size: 'unknown' })).size).toBeUndefined()
  })

  it('converts unix timestamp date_created to ISO', () => {
    const result = transformCompany(makeRaw({ date_created: 1737000000 }))
    expect(result.created_at).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('passes CompanySchema.parse without throwing', () => {
    const raw = makeRaw({
      id: '10',
      name: 'Acme Industries',
      phone: '+14155550123',
      website: 'acme.com',
      size: 350,
      date_created: 1737000000,
      date_modified: 1737086400,
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('accelo untransformCompany', () => {
  it('maps name back', () => {
    expect(untransformCompany({ name: 'Acme' }).name).toBe('Acme')
  })

  it('maps phone back', () => {
    expect(untransformCompany({ phone: '+14155550123' }).phone).toBe('+14155550123')
  })

  it('maps domain back to website', () => {
    expect(untransformCompany({ domain: 'acme.com' }).website).toBe('acme.com')
  })

  it('round-trips name and phone', () => {
    const raw = makeRaw({ name: 'Round Trip Ltd', phone: '+15555551234' })
    const canonical = transformCompany(raw)
    const back = untransformCompany(canonical)
    expect(back.name).toBe('Round Trip Ltd')
    expect(back.phone).toBe('+15555551234')
  })
})
