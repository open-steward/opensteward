import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawJobdivaClient,
} from '../../../../../../../src/verticals/crm/adapters/jobdiva/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawJobdivaClient> = {}): RawJobdivaClient {
  return { clientid: '1', companyname: 'Acme', ...overrides }
}

describe('jobdiva transformCompany', () => {
  it('maps clientid to string id (primary)', () => {
    expect(transformCompany(makeRaw({ clientid: '42' })).id).toBe('42')
  })

  it('falls back to companyid when clientid absent', () => {
    expect(transformCompany({ companyid: '7', companyname: 'Test' }).id).toBe('7')
  })

  it('maps companyname to name', () => {
    expect(transformCompany(makeRaw({ companyname: 'Globex' })).name).toBe('Globex')
  })

  it('falls back to name field when companyname absent', () => {
    expect(transformCompany({ clientid: '1', name: 'FallbackCo' }).name).toBe('FallbackCo')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'acme.com' })).domain).toBe('acme.com')
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw({ phone: '+1-555-0100' })).phone).toBe('+1-555-0100')
  })

  it('maps industry', () => {
    expect(transformCompany(makeRaw({ industry: 'Technology' })).industry).toBe('Technology')
  })

  it('maps numberofemployees to size', () => {
    expect(transformCompany(makeRaw({ numberofemployees: 200 })).size).toBe(200)
  })

  it('maps ownerid to owner_id', () => {
    expect(transformCompany(makeRaw({ ownerid: '9' })).owner_id).toBe('9')
  })

  it('maps createdat to created_at', () => {
    expect(transformCompany(makeRaw({ createdat: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces a CompanySchema-valid result', () => {
    const raw = makeRaw({
      clientid: '1',
      companyname: 'Acme',
      website: 'acme.com',
      phone: '+1-555-0100',
      industry: 'Technology',
      numberofemployees: 200,
      ownerid: '9',
      createdat: '2026-01-01T00:00:00.000Z',
      modifiedat: '2026-01-02T00:00:00.000Z',
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('jobdiva untransformCompany', () => {
  it('maps name to companyname', () => {
    expect(untransformCompany({ name: 'Acme' }).companyname).toBe('Acme')
  })

  it('maps domain to website', () => {
    expect(untransformCompany({ domain: 'acme.com' }).website).toBe('acme.com')
  })

  it('maps size to numberofemployees', () => {
    expect(untransformCompany({ size: 500 }).numberofemployees).toBe(500)
  })

  it('round-trips name, phone, domain', () => {
    const canonical = transformCompany(makeRaw({ phone: '+1-555-0100', website: 'acme.com' }))
    const wire = untransformCompany(canonical)
    expect(wire.companyname).toBe('Acme')
    expect(wire.phone).toBe('+1-555-0100')
    expect(wire.website).toBe('acme.com')
  })
})
