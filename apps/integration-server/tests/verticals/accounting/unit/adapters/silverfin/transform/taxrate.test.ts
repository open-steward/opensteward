import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type SilverfinTaxRate } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/taxrate'

function makeTaxRate(overrides: Partial<SilverfinTaxRate> = {}): SilverfinTaxRate {
  return {
    id: '1',
    name: 'Standard VAT 21%',
    rate: 21,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Standard VAT 21%')
    expect(result.rate).toBe(21)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps is_active false correctly', () => {
    const result = transformTaxRate(makeTaxRate({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when is_active is undefined', () => {
    const raw = makeTaxRate()
    // @ts-expect-error intentional
    delete raw.is_active
    const result = transformTaxRate(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps zero rate', () => {
    const result = transformTaxRate(makeTaxRate({ rate: 0, name: 'Zero VAT' }))
    expect(result.rate).toBe(0)
    expect(result.name).toBe('Zero VAT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
