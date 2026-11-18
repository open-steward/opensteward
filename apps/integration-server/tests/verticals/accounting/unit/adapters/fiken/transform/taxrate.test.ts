import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type FikenTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/taxrate'

function makeTaxRate(overrides: Partial<FikenTaxRate> = {}): FikenTaxRate {
  return {
    vatType: 'HIGH',
    description: 'Standard MVA 25%',
    percentage: 25,
    active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps vatType to id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('HIGH')
  })

  it('maps vatType to name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('HIGH')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('Standard MVA 25%')
  })

  it('converts percentage to decimal rate (percentage / 100)', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 25 })).rate).toBe(0.25)
  })

  it('converts zero percentage to zero rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 0 })).rate).toBe(0)
  })

  it('converts 15 percentage to 0.15 rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 15 })).rate).toBe(0.15)
  })

  it('maps active=true to isActive', () => {
    expect(transformTaxRate(makeTaxRate({ active: true })).isActive).toBe(true)
  })

  it('maps active=false to isActive', () => {
    expect(transformTaxRate(makeTaxRate({ active: false })).isActive).toBe(false)
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
