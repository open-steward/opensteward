import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type DolibarrTaxRate } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/taxrate'

function makeRaw(overrides: Partial<DolibarrTaxRate> = {}): DolibarrTaxRate {
  return {
    rowid: 2,
    code: 'TVA20',
    label: 'TVA 20%',
    taux: 20,
    active: 1,
    ...overrides,
  }
}

describe('transformTaxRate (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('2')
    expect(result.name).toBe('TVA 20%')
    expect(result.rate).toBe(20)
    expect(result.isActive).toBe(true)
  })

  it('maps inactive tax rate', () => {
    const result = transformTaxRate(makeRaw({ active: 0 }))
    expect(result.isActive).toBe(false)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
