import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type SellsyTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/taxrate'

function makeTaxRate(overrides: Partial<SellsyTaxRate> = {}): SellsyTaxRate {
  return {
    id: 'tax-001',
    name: 'TVA 20%',
    description: 'Taxe sur la valeur ajoutée - taux normal',
    rate: 20,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('TVA 20%')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe(
      'Taxe sur la valeur ajoutée - taux normal',
    )
  })

  it('converts rate from percentage to decimal', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 20 })).rate).toBe(0.2)
  })

  it('converts 5.5% rate to 0.055 decimal', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 5.5 })).rate).toBeCloseTo(0.055)
  })

  it('converts 10% rate to 0.1 decimal', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 10 })).rate).toBe(0.1)
  })

  it('converts 0% rate to 0 decimal', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 0 })).rate).toBe(0)
  })

  it('maps is_active true to isActive true', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active false to isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: false })).isActive).toBe(false)
  })

  it('returns undefined name when empty', () => {
    expect(transformTaxRate(makeTaxRate({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined description when empty', () => {
    expect(transformTaxRate(makeTaxRate({ description: '' })).description).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
