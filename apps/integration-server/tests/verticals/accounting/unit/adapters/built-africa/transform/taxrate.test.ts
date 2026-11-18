import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type BuiltAfricaTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/built-africa/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<BuiltAfricaTaxRate> = {}): BuiltAfricaTaxRate {
  return {
    id: 3,
    name: 'VAT 16%',
    description: 'Standard VAT rate',
    rate: 16,
    is_active: true,
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id to string', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('3')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('VAT 16%')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('Standard VAT rate')
  })

  it('maps rate as-is (percentage number)', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 16 })).rate).toBe(16)
  })

  it('maps fractional rate', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 8.75 })).rate).toBe(8.75)
  })

  it('returns undefined rate when rate is absent', () => {
    expect(transformTaxRate(makeTaxRate({ rate: undefined })).rate).toBeUndefined()
  })

  it('maps is_active=true to isActive=true', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active=false to isActive=false', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: false })).isActive).toBe(false)
  })

  it('maps is_active=1 (number) to isActive=true', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: 1 })).isActive).toBe(true)
  })

  it('maps is_active=0 (number) to isActive=false', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: 0 })).isActive).toBe(false)
  })

  it('returns undefined isActive when is_active is absent', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: undefined })).isActive).toBeUndefined()
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformTaxRate(makeTaxRate()).createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformTaxRate(makeTaxRate()).updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('returns undefined name when name is absent', () => {
    expect(transformTaxRate(makeTaxRate({ name: undefined })).name).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeTaxRate()))).not.toThrow()
  })
})
