import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type AccountEdgeTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/accountedge/transform/taxrate'

function makeTaxRate(overrides: Partial<AccountEdgeTaxRate> = {}): AccountEdgeTaxRate {
  return {
    id: 'tax-001',
    name: 'HST Ontario',
    rate: 13,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('HST Ontario')
  })

  it('converts rate to decimal (rate/100)', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 13 })).rate).toBe(0.13)
  })

  it('converts 5% rate to 0.05', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 5 })).rate).toBe(0.05)
  })

  it('converts 0% rate to 0', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 0 })).rate).toBe(0)
  })

  it('maps is_active=true', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active=false', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: false })).isActive).toBe(false)
  })

  it('returns undefined name when name is empty', () => {
    expect(transformTaxRate(makeTaxRate({ name: '' })).name).toBeUndefined()
  })

  it('handles GST rate', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 5 })).rate).toBe(0.05)
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
