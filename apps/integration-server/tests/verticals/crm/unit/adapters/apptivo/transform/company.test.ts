import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawApptivoCompany } from '../../../../../../../src/verticals/crm/adapters/apptivo/transform/company'

function makeRaw(overrides: Partial<RawApptivoCompany> = {}): RawApptivoCompany {
  return { customerId: '1', ...overrides }
}

describe('apptivo transformCompany', () => {
  it('maps id from customerId', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps name', () => {
    const result = transformCompany(makeRaw({ name: 'Acme Corp' }))
    expect(result.name).toBe('Acme Corp')
  })

  it('maps phone from phoneList', () => {
    const result = transformCompany(makeRaw({ phoneList: [{ phone: '555-1234', type: 'work' }] }))
    expect(result.phone).toBe('555-1234')
  })

  it('extracts domain from website URL', () => {
    const result = transformCompany(makeRaw({ website: 'https://www.example.com' }))
    expect(result.domain).toBe('example.com')
  })

  it('maps industry', () => {
    const result = transformCompany(makeRaw({ industry: 'Tech' }))
    expect(result.industry).toBe('Tech')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Test Corp' })
    expect(result).toBeDefined()
    expect(result.name).toBe('Test Corp')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
