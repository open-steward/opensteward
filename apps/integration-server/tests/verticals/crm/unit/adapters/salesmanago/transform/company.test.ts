import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/salesmanago/transform/company'
import type { RawSaleSmanagoCompany } from '../../../../../../../src/verticals/crm/adapters/salesmanago/transform/company'

function makeRaw(overrides: Partial<RawSaleSmanagoCompany> = {}): RawSaleSmanagoCompany {
  return { id: 'co1', ...overrides }
}

describe('salesmanago transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('co1')
  })
  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme' })).name).toBe('Acme')
  })
  it('maps created_at from epoch ms', () => {
    const ts = new Date('2024-01-01T00:00:00Z').getTime()
    expect(transformCompany(makeRaw({ createdOn: ts })).created_at).toBe('2024-01-01T00:00:00.000Z')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Acme', phone: '555' })
    expect(result.name).toBe('Acme')
    expect(result.phone).toBe('555')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
