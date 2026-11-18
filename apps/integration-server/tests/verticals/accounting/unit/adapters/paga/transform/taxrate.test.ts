import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type PagaStubTaxRate } from '../../../../../../../src/verticals/accounting/adapters/paga/transform/taxrate'

function makeRaw(overrides: Partial<PagaStubTaxRate> = {}): PagaStubTaxRate {
  return { ...overrides }
}

describe('paga transformTaxRate', () => {
  it('handles missing optional fields gracefully', () => {
    expect(() => transformTaxRate(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
