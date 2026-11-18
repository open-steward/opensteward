import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type KoraStubTaxRate } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/taxrate'

function makeRaw(overrides: KoraStubTaxRate = {}): KoraStubTaxRate {
  return { ...overrides }
}

describe('kora transformTaxRate', () => {
  it('handles empty object gracefully', () => {
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
