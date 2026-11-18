import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type SnelStartTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/taxrate'

function makeTaxRate(overrides: Partial<SnelStartTaxRate> = {}): SnelStartTaxRate {
  return {
    id: 'btw-001',
    naam: 'BTW 21%',
    percentage: 21,
    isActief: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('btw-001')
  })

  it('maps naam to name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('BTW 21%')
  })

  it('maps percentage/100 to rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 21 })).rate).toBeCloseTo(0.21)
  })

  it('maps zero percentage to rate 0', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 0 })).rate).toBe(0)
  })

  it('maps 9% percentage correctly', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 9 })).rate).toBeCloseTo(0.09)
  })

  it('maps isActief=true to isActive=true', () => {
    expect(transformTaxRate(makeTaxRate({ isActief: true })).isActive).toBe(true)
  })

  it('maps isActief=false to isActive=false', () => {
    expect(transformTaxRate(makeTaxRate({ isActief: false })).isActive).toBe(false)
  })

  it('returns undefined name when naam is empty', () => {
    expect(transformTaxRate(makeTaxRate({ naam: '' })).name).toBeUndefined()
  })

  it('handles high percentage values', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 100 })).rate).toBe(1)
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
