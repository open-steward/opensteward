import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawJobAdderCompany,
} from '../../../../../../../src/verticals/crm/adapters/jobadder/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawJobAdderCompany> = {}): RawJobAdderCompany {
  return { companyId: 1, name: 'Acme', ...overrides }
}

describe('jobadder transformCompany', () => {
  it('maps companyId to string id', () => {
    expect(transformCompany(makeRaw({ companyId: 99 })).id).toBe('99')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Globex' })).name).toBe('Globex')
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw({ phone: '+1-555-0100' })).phone).toBe('+1-555-0100')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'acme.com' })).domain).toBe('acme.com')
  })

  it('maps owner.userId to owner_id', () => {
    expect(transformCompany(makeRaw({ owner: { userId: 7 } })).owner_id).toBe('7')
  })

  it('maps address fields', () => {
    const result = transformCompany(
      makeRaw({
        address: {
          street: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          postalCode: '62701',
          country: 'US',
        },
      }),
    )
    expect(result.address?.line1).toBe('123 Main St')
    expect(result.address?.city).toBe('Springfield')
    expect(result.address?.region).toBe('IL')
    expect(result.address?.postalCode).toBe('62701')
    expect(result.address?.country).toBe('US')
  })

  it('maps createdAt to created_at', () => {
    expect(transformCompany(makeRaw({ createdAt: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces a CompanySchema-valid result', () => {
    const raw = makeRaw({
      companyId: 1,
      name: 'Acme',
      phone: '+1-555-0100',
      website: 'acme.com',
      owner: { userId: 7 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('jobadder untransformCompany', () => {
  it('maps name', () => {
    expect(untransformCompany({ name: 'Acme' }).name).toBe('Acme')
  })

  it('maps domain to website', () => {
    expect(untransformCompany({ domain: 'acme.com' }).website).toBe('acme.com')
  })

  it('maps address fields to street/city/state', () => {
    const result = untransformCompany({
      address: {
        line1: '123 Main St',
        city: 'Springfield',
        region: 'IL',
        postalCode: '62701',
        country: 'US',
      },
    })
    const addr = result.address as Record<string, unknown>
    expect(addr.street).toBe('123 Main St')
    expect(addr.city).toBe('Springfield')
    expect(addr.state).toBe('IL')
  })

  it('round-trips name and phone', () => {
    const canonical = transformCompany(makeRaw({ phone: '+1-555-0100', website: 'acme.com' }))
    const wire = untransformCompany(canonical)
    expect(wire.name).toBe('Acme')
    expect(wire.phone).toBe('+1-555-0100')
    expect(wire.website).toBe('acme.com')
  })
})
