import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type AutocountTaxCode,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/taxrate'

function makeRaw(overrides: Partial<AutocountTaxCode> = {}): AutocountTaxCode {
  return {
    TaxCode: 'SR',
    Description: 'Standard-Rated (6%)',
    TaxRate: 6,
    TaxType: 'SR',
    ...overrides,
  }
}

describe('transformTaxRate (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('SR')
    expect(result.name).toBe('SR')
    expect(result.description).toBe('Standard-Rated (6%)')
    expect(result.rate).toBe(6)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps zero-rated tax code correctly', () => {
    const result = transformTaxRate(makeRaw({ TaxCode: 'ZR', Description: 'Zero-Rated', TaxRate: 0, TaxType: 'ZR' }))
    expect(result.id).toBe('ZR')
    expect(result.rate).toBe(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
