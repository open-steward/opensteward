import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type QoyodTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<QoyodTaxRate> = {}): QoyodTaxRate {
  return {
    id: 1,
    name: 'Standard VAT',
    rate: 15,
    is_active: true,
    ...overrides,
  }
}

describe('qoyod transformTaxRate', () => {
  it('maps numeric id to string', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('Standard VAT')
  })

  it('maps name to description as well', () => {
    // Source uses raw.name for both name and description
    expect(transformTaxRate(makeRaw()).description).toBe('Standard VAT')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(15)
  })

  it('maps is_active=true to isActive=true', () => {
    expect(transformTaxRate(makeRaw({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active=false to isActive=false', () => {
    expect(transformTaxRate(makeRaw({ is_active: false })).isActive).toBe(false)
  })

  it('defaults isActive=true when is_active is null', () => {
    expect(transformTaxRate(makeRaw({ is_active: null })).isActive).toBe(true)
  })

  it('passes TaxRateSchema.parse', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeRaw()))).not.toThrow()
  })
})
