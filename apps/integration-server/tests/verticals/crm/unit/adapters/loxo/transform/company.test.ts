import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawLoxoCompany,
} from '../../../../../../../src/verticals/crm/adapters/loxo/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawLoxoCompany> = {}): RawLoxoCompany {
  return { id: 1, name: 'Acme Corp', ...overrides }
}

describe('loxo transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Globex' })).name).toBe('Globex')
  })

  it('maps url to domain', () => {
    expect(transformCompany(makeRaw({ url: 'globex.com' })).domain).toBe('globex.com')
  })

  it('picks primary phone from phones array', () => {
    const raw = makeRaw({
      phones: [
        { number: '+12125550100', is_primary: false },
        { number: '+14155550200', is_primary: true },
      ],
    })
    expect(transformCompany(raw).phone).toBe('+14155550200')
  })

  it('falls back to first phone when none is primary', () => {
    const raw = makeRaw({
      phones: [{ number: '+12125550100', is_primary: false }],
    })
    expect(transformCompany(raw).phone).toBe('+12125550100')
  })

  it('returns undefined phone when phones is empty', () => {
    expect(transformCompany(makeRaw({ phones: [] })).phone).toBeUndefined()
  })

  it('maps created_at to IsoDatetime', () => {
    const result = transformCompany(makeRaw({ created_at: '2024-05-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-05-01T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('passes CompanySchema validation', () => {
    const raw: RawLoxoCompany = {
      id: 10,
      name: 'Initech',
      url: 'initech.com',
      phones: [{ number: '+12125550100', is_primary: true }],
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-06-01T00:00:00.000Z',
    }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('loxo untransformCompany', () => {
  it('maps name', () => {
    expect(untransformCompany({ name: 'Globex' }).name).toBe('Globex')
  })

  it('maps domain to url', () => {
    expect(untransformCompany({ domain: 'globex.com' }).url).toBe('globex.com')
  })

  it('maps phone', () => {
    expect(untransformCompany({ phone: '+1234' }).phone).toBe('+1234')
  })
})
