import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  YUKI_VAT_RATES,
  type YukiVATRate,
} from '../../../../../../../src/verticals/accounting/adapters/yuki/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<YukiVATRate> = {}): YukiVATRate {
  return {
    code: '1',
    name: 'High VAT (21%)',
    rate: 21,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (yuki)', () => {
  it('maps code to id prefixed with vat_', () => {
    expect(transformTaxRate(makeRaw({ code: '1' })).id).toBe('vat_1')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('High VAT (21%)')
  })

  it('maps name to description as well', () => {
    expect(transformTaxRate(makeRaw()).description).toBe('High VAT (21%)')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(21)
  })

  it('maps isActive', () => {
    expect(transformTaxRate(makeRaw({ isActive: false })).isActive).toBe(false)
  })

  it('produces a schema-valid TaxRate', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeRaw()))).not.toThrow()
  })

  describe('YUKI_VAT_RATES static list', () => {
    it('contains 7 VAT rates', () => {
      expect(YUKI_VAT_RATES).toHaveLength(7)
    })

    it('includes the 21% high rate with code 1', () => {
      const high = YUKI_VAT_RATES.find((r) => r.code === '1')
      expect(high?.rate).toBe(21)
    })

    it('includes the 9% low rate with code 2', () => {
      const low = YUKI_VAT_RATES.find((r) => r.code === '2')
      expect(low?.rate).toBe(9)
    })

    it('all rates produce schema-valid TaxRate objects', () => {
      for (const rate of YUKI_VAT_RATES) {
        expect(() => TaxRateSchema.parse(transformTaxRate(rate))).not.toThrow()
      }
    })
  })
})
