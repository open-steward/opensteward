import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  getBuiltinTaxRates,
  type InfaktVatRate,
} from '../../../../../../../src/verticals/accounting/adapters/infakt/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRate(overrides: Partial<InfaktVatRate> = {}): InfaktVatRate {
  return {
    symbol: '23',
    rate: 23,
    label: 'VAT 23%',
    ...overrides,
  }
}

describe('transformTaxRate (infakt)', () => {
  it('maps symbol to id', () => {
    expect(transformTaxRate(makeRate()).id).toBe('23')
  })

  it('maps label to name', () => {
    expect(transformTaxRate(makeRate()).name).toBe('VAT 23%')
  })

  it('maps numeric rate directly', () => {
    expect(transformTaxRate(makeRate({ symbol: '8', rate: 8, label: 'VAT 8%' })).rate).toBe(8)
  })

  it('maps 0% rate', () => {
    expect(transformTaxRate(makeRate({ symbol: '0', rate: 0, label: 'VAT 0%' })).rate).toBe(0)
  })

  it('maps exempt zw symbol with rate 0', () => {
    const result = transformTaxRate(
      makeRate({ symbol: 'zw', rate: 0, label: 'VAT zwolniony (exempt)' }),
    )
    expect(result.id).toBe('zw')
    expect(result.rate).toBe(0)
  })

  it('maps null rate to undefined for np symbol (outside scope)', () => {
    const result = transformTaxRate(
      makeRate({ symbol: 'np', rate: null, label: 'VAT nie podlega' }),
    )
    expect(result.rate).toBeUndefined()
  })

  it('uses symbol as name when label is empty string', () => {
    const result = transformTaxRate(makeRate({ label: '' }))
    expect(result.name).toBe('23')
  })

  it('sets isActive to true', () => {
    expect(transformTaxRate(makeRate()).isActive).toBe(true)
  })

  it('produces a schema-valid TaxRate', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeRate()))).not.toThrow()
  })

  describe('getBuiltinTaxRates', () => {
    it('returns 6 built-in rates', () => {
      expect(getBuiltinTaxRates()).toHaveLength(6)
    })

    it('all built-in rates are schema-valid', () => {
      for (const rate of getBuiltinTaxRates()) {
        expect(() => TaxRateSchema.parse(rate)).not.toThrow()
      }
    })

    it('includes a 23% standard rate', () => {
      const rates = getBuiltinTaxRates()
      const r23 = rates.find((r) => r.id === '23')
      expect(r23?.rate).toBe(23)
    })

    it('includes an exempt rate with rate=0', () => {
      const zwRate = getBuiltinTaxRates().find((r) => r.id === 'zw')
      expect(zwRate?.rate).toBe(0)
    })
  })
})
