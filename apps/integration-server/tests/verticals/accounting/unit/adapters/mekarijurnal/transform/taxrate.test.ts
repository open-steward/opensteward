import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type MekariJurnalTaxRate } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/taxrate'

function makeTaxRate(overrides: Partial<MekariJurnalTaxRate> = {}): MekariJurnalTaxRate {
  return {
    id: 3,
    name: 'PPN 11%',
    rate: 11,
    is_inclusive: false,
    ...overrides,
  }
}

describe('transformTaxRate (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('3')
    expect(result.name).toBe('PPN 11%')
    expect(result.rate).toBe(11)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles decimal rates', () => {
    const result = transformTaxRate(makeTaxRate({ rate: 2.5 }))
    expect(result.rate).toBe(2.5)
  })

  it('handles zero rate', () => {
    const result = transformTaxRate(makeTaxRate({ rate: 0 }))
    expect(result.rate).toBe(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
