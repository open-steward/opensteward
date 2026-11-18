import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawPipelinerAccount,
} from '../../../../../../../src/verticals/crm/adapters/pipeliner/transform/company'

function makeRaw(overrides: Partial<RawPipelinerAccount> = {}): RawPipelinerAccount {
  return { id: 'acc-1', name: 'Acme', ...overrides }
}

describe('pipeliner transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw({ id: 'acc-7' })).id).toBe('acc-7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain from homepage', () => {
    expect(transformCompany(makeRaw({ homepage: 'https://acme.com' })).domain).toBe('https://acme.com')
  })

  it('maps phone from phone1', () => {
    expect(transformCompany(makeRaw({ phone1: '555-0001' })).phone).toBe('555-0001')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 'acc-7' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('pipeliner untransformCompany', () => {
  it('maps domain to homepage', () => {
    const result = untransformCompany({ domain: 'https://corp.com' })
    expect(result.homepage).toBe('https://corp.com')
  })
})
