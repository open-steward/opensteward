import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type IfirmaStawkaVat,
} from '../../../../../../../src/verticals/accounting/adapters/ifirma/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRate(overrides: Partial<IfirmaStawkaVat> = {}): IfirmaStawkaVat {
  return {
    Rodzaj: 'POD',
    Wartosc: 23,
    ...overrides,
  }
}

describe('transformTaxRate (ifirma)', () => {
  it('synthesises id as countryCode_Rodzaj', () => {
    expect(transformTaxRate(makeRate(), 'PL').id).toBe('PL_POD')
  })

  it('uppercases the country code in the id', () => {
    expect(transformTaxRate(makeRate(), 'pl').id).toBe('PL_POD')
  })

  it('maps standard rate name to "PL Standard"', () => {
    expect(transformTaxRate(makeRate({ Rodzaj: 'POD' }), 'PL').name).toBe('PL Standard')
  })

  it('maps reduced rate PR1 name', () => {
    expect(transformTaxRate(makeRate({ Rodzaj: 'PR1', Wartosc: 8 }), 'PL').name).toBe(
      'PL Reduced (1)',
    )
  })

  it('maps exempt ZW to rate 0', () => {
    expect(transformTaxRate(makeRate({ Rodzaj: 'ZW', Wartosc: 0 }), 'PL').rate).toBe(0)
  })

  it('maps NP (outside scope) to rate 0', () => {
    expect(transformTaxRate(makeRate({ Rodzaj: 'NP', Wartosc: 0 }), 'PL').rate).toBe(0)
  })

  it('maps standard rate Wartosc directly to rate', () => {
    expect(transformTaxRate(makeRate({ Rodzaj: 'POD', Wartosc: 23 }), 'PL').rate).toBe(23)
  })

  it('sets isActive to true', () => {
    expect(transformTaxRate(makeRate(), 'PL').isActive).toBe(true)
  })

  it('produces a schema-valid TaxRate', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeRate(), 'PL'))).not.toThrow()
  })
})
