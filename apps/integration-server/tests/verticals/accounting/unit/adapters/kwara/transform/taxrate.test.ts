import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type KwaraTaxRate } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/taxrate'

function makeRaw(overrides: Partial<KwaraTaxRate> = {}): KwaraTaxRate {
  return { id: 'tax-001', name: 'VAT', rate: 7.5, is_active: true, ...overrides }
}

describe('transformTaxRate (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformTaxRate(makeRaw())
    expect(r.id).toBe('tax-001')
    expect(r.name).toBe('VAT')
    expect(r.rate).toBe(7.5)
    expect(r.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
