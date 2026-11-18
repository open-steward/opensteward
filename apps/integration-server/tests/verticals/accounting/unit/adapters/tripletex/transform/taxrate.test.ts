import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type TripletexVATType,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/taxrate'

function makeTaxRate(overrides: Partial<TripletexVATType> = {}): TripletexVATType {
  return {
    id: 3,
    name: 'Standard VAT',
    number: 'VAT3',
    percentage: 25,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id correctly', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('3')
  })

  it('maps name correctly', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard VAT')
  })

  it('maps number to description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('VAT3')
  })

  it('maps percentage to rate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(25)
  })

  it('maps a zero percentage correctly', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 0 })).rate).toBe(0)
  })

  it('maps a reduced rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 15 })).rate).toBe(15)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
