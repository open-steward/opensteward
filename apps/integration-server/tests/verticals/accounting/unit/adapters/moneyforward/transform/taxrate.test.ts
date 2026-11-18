import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  MONEYFORWARD_HARDCODED_TAX_RATES,
  type MoneyForwardHardcodedTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/taxrate'

function makeRaw(overrides: Partial<MoneyForwardHardcodedTaxRate> = {}): MoneyForwardHardcodedTaxRate {
  return {
    id: 'jp_standard_10',
    name: '消費税 (標準税率 10%)',
    rate: 10,
    ...overrides,
  }
}

describe('transformTaxRate (moneyforward)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('jp_standard_10')
    expect(result.name).toBe('消費税 (標準税率 10%)')
    expect(result.rate).toBe(10)
    expect(result.isActive).toBe(true)
  })

  it('maps description from name', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.description).toBe('消費税 (標準税率 10%)')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('hardcoded rates include standard 10% and reduced 8%', () => {
    expect(MONEYFORWARD_HARDCODED_TAX_RATES).toHaveLength(2)
    const rates = MONEYFORWARD_HARDCODED_TAX_RATES.map((r) => r.rate)
    expect(rates).toContain(10)
    expect(rates).toContain(8)
  })

  it('transforms all hardcoded rates without error', () => {
    const results = MONEYFORWARD_HARDCODED_TAX_RATES.map(transformTaxRate)
    expect(results).toHaveLength(2)
    results.forEach((r) => {
      expect(r.isActive).toBe(true)
      expect(r.rate).toBeGreaterThan(0)
    })
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
