import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type SimplbooksTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/simplbooks/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<SimplbooksTaxRate> = {}): SimplbooksTaxRate {
  return {
    id: 1,
    name: 'Standard VAT 20%',
    rate: 20,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (simplbooks)', () => {
  it('maps numeric id to string id', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('Standard VAT 20%')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(20)
  })

  it('maps is_active=true to isActive=true', () => {
    expect(transformTaxRate(makeRaw({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active=false to isActive=false', () => {
    expect(transformTaxRate(makeRaw({ is_active: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when is_active is null', () => {
    // source: raw.is_active ?? true
    expect(transformTaxRate(makeRaw({ is_active: null })).isActive).toBe(true)
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeRaw()))).not.toThrow()
  })
})
