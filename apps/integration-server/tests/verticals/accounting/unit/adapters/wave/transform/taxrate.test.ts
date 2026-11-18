import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type WaveTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/wave/transform/taxrate'

function makeTaxRate(overrides: Partial<WaveTaxRate> = {}): WaveTaxRate {
  return {
    id: 'tax-001',
    name: 'HST Ontario',
    rate: 13,
    isActive: true,
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

  it('divides rate by 100', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 13 })).rate).toBe(0.13)
  })

  it('maps isActive', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: true })).isActive).toBe(true)
    expect(transformTaxRate(makeTaxRate({ isActive: false })).isActive).toBe(false)
  })

  it('returns undefined name when name is empty', () => {
    expect(transformTaxRate(makeTaxRate({ name: '' })).name).toBeUndefined()
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
