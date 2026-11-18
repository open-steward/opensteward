import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type AfasVatCode,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<AfasVatCode> = {}): AfasVatCode {
  return {
    VatCode: 'H',
    VatDescription: 'High VAT Rate',
    VatPercent: 21,
    VatIsActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('H')
    expect(result.name).toBe('High VAT Rate')
    expect(result.description).toBe('High VAT Rate')
    expect(result.rate).toBe(21)
    expect(result.isActive).toBe(true)
  })

  it('maps VatIsActive=false correctly', () => {
    const result = transformTaxRate(makeRaw({ VatIsActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
