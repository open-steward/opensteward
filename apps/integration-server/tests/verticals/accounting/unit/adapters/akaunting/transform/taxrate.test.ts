import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type AkauntingTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/taxrate'

function makeTaxRate(overrides: Partial<AkauntingTaxRate> = {}): AkauntingTaxRate {
  return {
    id: 501,
    name: 'Standard VAT',
    rate: 19,
    type: 'normal',
    enabled: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id as string', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('501')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard VAT')
  })

  it('converts rate from percentage to decimal by dividing by 100', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 19 })).rate).toBeCloseTo(0.19)
  })

  it('converts zero rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 0 })).rate).toBe(0)
  })

  it('converts rate of 25 to 0.25', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 25 })).rate).toBeCloseTo(0.25)
  })

  it('converts rate of 7.5 to 0.075', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 7.5 })).rate).toBeCloseTo(0.075)
  })

  it('maps enabled=true to isActive true', () => {
    expect(transformTaxRate(makeTaxRate({ enabled: true })).isActive).toBe(true)
  })

  it('maps enabled=false to isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ enabled: false })).isActive).toBe(false)
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
