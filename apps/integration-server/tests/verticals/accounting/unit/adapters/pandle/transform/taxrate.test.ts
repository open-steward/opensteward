import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type PandleTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/taxrate'

function makeTaxRate(overrides: Partial<PandleTaxRate> = {}): PandleTaxRate {
  return {
    id: 1,
    name: 'Standard Rate',
    percentage: 20,
    description: 'UK Standard VAT 20%',
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id as string', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard Rate')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('UK Standard VAT 20%')
  })

  it('converts percentage to decimal rate (20 → 0.2)', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 20 })).rate).toBe(0.2)
  })

  it('converts 5% to 0.05', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 5 })).rate).toBe(0.05)
  })

  it('converts 0% to 0', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 0 })).rate).toBe(0)
  })

  it('maps is_active=true', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active=false', () => {
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
