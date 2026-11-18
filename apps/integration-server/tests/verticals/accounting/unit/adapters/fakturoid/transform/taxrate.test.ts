import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type FakturoidTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/taxrate'

function makeTaxRate(overrides: Partial<FakturoidTaxRate> = {}): FakturoidTaxRate {
  return {
    id: 401,
    name: 'Standard VAT',
    vat_rate: 21,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id as string', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('401')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard VAT')
  })

  it('maps vat_rate divided by 100 to rate', () => {
    expect(transformTaxRate(makeTaxRate({ vat_rate: 21 })).rate).toBe(0.21)
  })

  it('maps zero vat_rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ vat_rate: 0 })).rate).toBe(0)
  })

  it('maps reduced rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ vat_rate: 15 })).rate).toBe(0.15)
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

  it('maps 10% rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ vat_rate: 10 })).rate).toBe(0.1)
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
