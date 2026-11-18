import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawAttioCompany } from '../../../../../../../src/verticals/crm/adapters/attio/transform/company'

function makeRaw(overrides: Partial<RawAttioCompany> = {}): RawAttioCompany {
  return {
    id: { record_id: 'rec1' },
    values: { name: [{ value: 'Acme' }] },
    ...overrides,
  }
}

describe('attio transformCompany', () => {
  it('maps id from record_id', () => {
    expect(transformCompany(makeRaw()).id).toBe('rec1')
  })

  it('maps name from values.name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain from values.domains', () => {
    const raw = makeRaw({ values: { domains: [{ domain: 'acme.com' }] } })
    expect(transformCompany(raw).domain).toBe('acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany returns data.values wrapper', () => {
    const result = untransformCompany({ name: 'Corp' }) as { data: { values: Record<string, unknown> } }
    expect(result.data.values['name']).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
