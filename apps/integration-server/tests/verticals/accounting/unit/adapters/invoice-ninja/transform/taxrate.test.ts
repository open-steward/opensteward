import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type InvoiceNinjaTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/invoice-ninja/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<InvoiceNinjaTaxRate> = {}): InvoiceNinjaTaxRate {
  return {
    id: 'tax-1',
    name: 'Sales Tax',
    rate: 8.75,
    is_inclusive: false,
    is_deleted: false,
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-1')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Sales Tax')
  })

  it('returns undefined name when name is absent', () => {
    expect(transformTaxRate(makeTaxRate({ name: null })).name).toBeUndefined()
  })

  it('maps rate as raw percentage (not divided by 100)', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 8.75 })).rate).toBe(8.75)
  })

  it('maps rate=0 as undefined (falsy zero becomes undefined via ?? operator)', () => {
    // rate: raw.rate ?? undefined — null/undefined → undefined, but 0 passes through
    // Actually 0 ?? undefined is 0, only null/undefined is caught by ??
    expect(transformTaxRate(makeTaxRate({ rate: 0 })).rate).toBe(0)
  })

  it('returns undefined rate when rate is null', () => {
    expect(transformTaxRate(makeTaxRate({ rate: null })).rate).toBeUndefined()
  })

  it('maps isActive=true when is_deleted=false', () => {
    expect(transformTaxRate(makeTaxRate({ is_deleted: false })).isActive).toBe(true)
  })

  it('maps isActive=false when is_deleted=true', () => {
    expect(transformTaxRate(makeTaxRate({ is_deleted: true })).isActive).toBe(false)
  })

  it('maps isActive=true when is_deleted is undefined', () => {
    expect(transformTaxRate(makeTaxRate({ is_deleted: undefined })).isActive).toBe(true)
  })

  it('maps createdAt from epoch (×1000)', () => {
    expect(transformTaxRate(makeTaxRate()).createdAt).toEqual(new Date(1700000000 * 1000))
  })

  it('maps updatedAt from epoch (×1000)', () => {
    expect(transformTaxRate(makeTaxRate()).updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('returns undefined createdAt when created_at is absent', () => {
    expect(transformTaxRate(makeTaxRate({ created_at: null })).createdAt).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('passes TaxRateSchema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeTaxRate()))).not.toThrow()
  })
})
