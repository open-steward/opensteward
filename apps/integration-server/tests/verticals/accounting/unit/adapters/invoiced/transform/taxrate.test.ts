import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type InvoicedTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/invoiced/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<InvoicedTaxRate> = {}): InvoicedTaxRate {
  return {
    id: 5001,
    object: 'tax_rate',
    name: 'CA Sales Tax',
    value: 8.75,
    is_percent: true,
    inclusive: false,
    currency: null,
    metadata: {},
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('converts numeric id to string', () => {
    expect(transformTaxRate(makeTaxRate({ id: 5001 })).id).toBe('5001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate({ name: 'CA Sales Tax' })).name).toBe('CA Sales Tax')
  })

  it('maps name to description', () => {
    expect(transformTaxRate(makeTaxRate({ name: 'CA Sales Tax' })).description).toBe('CA Sales Tax')
  })

  it('maps value to rate when is_percent is true', () => {
    expect(transformTaxRate(makeTaxRate({ value: 8.75, is_percent: true })).rate).toBe(8.75)
  })

  it('sets rate to undefined when is_percent is false (flat amount, not a %)', () => {
    expect(transformTaxRate(makeTaxRate({ value: 50, is_percent: false })).rate).toBeUndefined()
  })

  it('always sets isActive to true', () => {
    expect(transformTaxRate(makeTaxRate()).isActive).toBe(true)
  })

  it('converts epoch seconds to Date for createdAt and updatedAt', () => {
    const result = transformTaxRate(makeTaxRate({ created_at: 1700000000, updated_at: 1700100000 }))
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000))
    expect(result.updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('sets createdAt to undefined when created_at is 0/falsy', () => {
    const result = transformTaxRate(makeTaxRate({ created_at: 0 }))
    expect(result.createdAt).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('passes TaxRateSchema validation', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
