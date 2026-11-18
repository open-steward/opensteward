import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawNutshellCompany,
} from '../../../../../../../src/verticals/crm/adapters/nutshell/transform/company'

function makeRaw(overrides: Partial<RawNutshellCompany> = {}): RawNutshellCompany {
  return { id: 1, name: 'Acme Inc', ...overrides }
}

describe('nutshell transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Inc')
  })

  it('maps domain from url', () => {
    expect(transformCompany(makeRaw({ url: 'https://acme.com' })).domain).toBe('https://acme.com')
  })

  it('extracts phone from object-style phones', () => {
    const result = transformCompany(makeRaw({ phones: { work: ['555-1234'] } }))
    expect(result.phone).toBe('555-1234')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 7 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('nutshell untransformCompany', () => {
  it('returns object with name and url', () => {
    const result = untransformCompany({ name: 'Acme', domain: 'https://acme.com' })
    expect(result.name).toBe('Acme')
    expect(result.url).toBe('https://acme.com')
  })
})
