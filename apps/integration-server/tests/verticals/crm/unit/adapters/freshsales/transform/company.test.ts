import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawFreshsalesCompany,
} from '../../../../../../../src/verticals/crm/adapters/freshsales/transform/company'

function makeRaw(overrides: Partial<RawFreshsalesCompany> = {}): RawFreshsalesCompany {
  return { id: 10, name: 'Acme Corp', ...overrides }
}

describe('freshsales transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 10 })).id).toBe('10')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Corp')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'https://acme.com' })).domain).toBe('https://acme.com')
  })

  it('maps number_of_employees to size', () => {
    expect(transformCompany(makeRaw({ number_of_employees: 50 })).size).toBe(50)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 10 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('freshsales untransformCompany', () => {
  it('maps domain to website', () => {
    const result = untransformCompany({ domain: 'acme.com' })
    expect(result.website).toBe('acme.com')
  })
})
