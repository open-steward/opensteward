import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type VismaTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/visma/transform/taxrate'

function makeTaxRate(overrides: Partial<VismaTaxRate> = {}): VismaTaxRate {
  return {
    Id: 'vat-25',
    Code: 'VAT25',
    Description: 'Standard VAT 25%',
    Percentage: 25,
    IsActive: true,
    CreatedUtc: '2024-01-15T00:00:00Z',
    ModifiedUtc: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps Id to id', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('vat-25')
  })

  it('maps Code to name', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.name).toBe('VAT25')
  })

  it('maps Description to description', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.description).toBe('Standard VAT 25%')
  })

  it('maps Percentage to rate', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.rate).toBe(25)
  })

  it('maps IsActive=true to isActive true', () => {
    const result = transformTaxRate(makeTaxRate({ IsActive: true }))
    expect(result.isActive).toBe(true)
  })

  it('maps IsActive=false to isActive false', () => {
    const result = transformTaxRate(makeTaxRate({ IsActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('parses CreatedUtc as Date', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.createdAt).toEqual(new Date('2024-01-15T00:00:00Z'))
  })

  it('parses ModifiedUtc as Date', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00Z'))
  })

  it('sets createdAt to undefined when CreatedUtc is empty', () => {
    const result = transformTaxRate(makeTaxRate({ CreatedUtc: '' }))
    expect(result.createdAt).toBeUndefined()
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
