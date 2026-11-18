import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type FortnoxVATCode,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/taxrate'

function makeVATCode(overrides: Partial<FortnoxVATCode> = {}): FortnoxVATCode {
  return {
    Code: 'MP1',
    Description: 'Moms 25%',
    VATPercent: 25,
    Active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps Code to id', () => {
    expect(transformTaxRate(makeVATCode()).id).toBe('MP1')
  })

  it('maps Description to name', () => {
    expect(transformTaxRate(makeVATCode()).name).toBe('Moms 25%')
  })

  it('maps Description to description', () => {
    expect(transformTaxRate(makeVATCode()).description).toBe('Moms 25%')
  })

  it('maps VATPercent to rate', () => {
    expect(transformTaxRate(makeVATCode()).rate).toBe(25)
  })

  it('maps Active=true to isActive=true', () => {
    expect(transformTaxRate(makeVATCode({ Active: true })).isActive).toBe(true)
  })

  it('maps Active=false to isActive=false', () => {
    expect(transformTaxRate(makeVATCode({ Active: false })).isActive).toBe(false)
  })

  it('maps zero rate correctly', () => {
    const result = transformTaxRate(makeVATCode({ Code: 'OVRI', Description: 'Moms 0%', VATPercent: 0 }))
    expect(result.id).toBe('OVRI')
    expect(result.rate).toBe(0)
  })

  it('passes raw object as metadata', () => {
    const raw = makeVATCode()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeVATCode())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
