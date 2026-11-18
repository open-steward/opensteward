import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type FinancioTaxRate } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/taxrate'

function makeRaw(overrides: Partial<FinancioTaxRate> = {}): FinancioTaxRate {
  return {
    id: '1',
    name: 'GST 9%',
    rate: 9,
    type: 'sales',
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('1')
    expect(result.name).toBe('GST 9%')
    expect(result.rate).toBe(9)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ name: 'Custom Rate' })
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['name']).toBe('Custom Rate')
  })

  it('maps is_active false', () => {
    const result = transformTaxRate(makeRaw({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('handles purchase type', () => {
    const result = transformTaxRate(makeRaw({ type: 'purchase' }))
    expect(result.id).toBe('1')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
