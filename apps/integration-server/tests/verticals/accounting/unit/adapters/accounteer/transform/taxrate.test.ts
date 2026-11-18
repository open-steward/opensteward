import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type AccounteerTaxRate } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/taxrate'

function makeRaw(overrides: Partial<AccounteerTaxRate> = {}): AccounteerTaxRate {
  return { id: '1', ...overrides }
}

describe('accounteer transformTaxRate', () => {
  it('maps id', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformTaxRate(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })
  it('maps name', () => {
    expect(transformTaxRate(makeRaw({ name: 'VAT 20%' })).name).toBe('VAT 20%')
  })
  it('maps rate', () => {
    expect(transformTaxRate(makeRaw({ rate: 20 })).rate).toBe(20)
  })
  it('defaults isActive to true when missing', () => {
    expect(transformTaxRate(makeRaw()).isActive).toBe(true)
  })
  it('maps is_active false -> false', () => {
    expect(transformTaxRate(makeRaw({ is_active: false })).isActive).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
