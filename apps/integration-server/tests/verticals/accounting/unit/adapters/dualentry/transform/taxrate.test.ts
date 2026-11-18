import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type DualentryVatRate,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<DualentryVatRate> = {}): DualentryVatRate {
  return {
    id: 1,
    country_code: 'PL',
    name: 'Standard VAT 23%',
    rate: '23.00',
    rate_type: 'standard',
    tax_type: 'vat',
    valid_from: null,
    valid_to: null,
    is_active: true,
    is_system: false,
    description: 'Polish standard rate',
    ...overrides,
  }
}

describe('dualentry transformTaxRate', () => {
  it('maps id to string', () => {
    const result = transformTaxRate(makeRaw({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps name', () => {
    const result = transformTaxRate(makeRaw({ name: 'Reduced VAT 8%' }))
    expect(result.name).toBe('Reduced VAT 8%')
  })

  it('rate string parsed via parseDecimal', () => {
    const result = transformTaxRate(makeRaw({ rate: '8.00' }))
    expect(result.rate).toBe(8)
  })

  it('is_active=true → isActive=true', () => {
    const result = transformTaxRate(makeRaw({ is_active: true }))
    expect(result.isActive).toBe(true)
  })

  it('is_active=false → isActive=false', () => {
    const result = transformTaxRate(makeRaw({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('maps description', () => {
    const result = transformTaxRate(makeRaw({ description: 'Standard rate' }))
    expect(result.description).toBe('Standard rate')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
