import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type TwinfieldTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/taxrate'

function makeTaxRate(overrides: Partial<TwinfieldTaxRate> = {}): TwinfieldTaxRate {
  return {
    code: 'VH',
    name: 'BTW Hoog',
    shortName: 'High VAT',
    percentage: 21,
    status: 'active',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps code to id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('VH')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('BTW Hoog')
  })

  it('maps shortName to description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('High VAT')
  })

  it('converts percentage to decimal rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 21 })).rate).toBeCloseTo(0.21)
  })

  it('converts zero percentage to zero rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 0 })).rate).toBe(0)
  })

  it('converts 9% to 0.09', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 9 })).rate).toBeCloseTo(0.09)
  })

  it('sets isActive true when status is active', () => {
    expect(transformTaxRate(makeTaxRate({ status: 'active' })).isActive).toBe(true)
  })

  it('sets isActive false when status is hidden', () => {
    expect(transformTaxRate(makeTaxRate({ status: 'hidden' })).isActive).toBe(false)
  })

  it('sets isActive false when status is deleted', () => {
    expect(transformTaxRate(makeTaxRate({ status: 'deleted' })).isActive).toBe(false)
  })

  it('returns undefined name when empty', () => {
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
