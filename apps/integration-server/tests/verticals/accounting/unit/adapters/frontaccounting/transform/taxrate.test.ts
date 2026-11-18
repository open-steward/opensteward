import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type FATaxType } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/taxrate'

function makeRaw(overrides: Partial<FATaxType> = {}): FATaxType {
  return {
    id: 1,
    name: 'VAT 20%',
    rate: 20,
    inactive: 0,
    ...overrides,
  }
}

describe('transformTaxRate (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('1')
    expect(result.name).toBe('VAT 20%')
    expect(result.rate).toBe(20)
    expect(result.isActive).toBe(true)
  })

  it('marks inactive tax rate', () => {
    const result = transformTaxRate(makeRaw({ inactive: 1 }))
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
