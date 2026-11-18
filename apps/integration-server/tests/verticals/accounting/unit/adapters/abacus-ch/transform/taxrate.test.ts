import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type AbacusTaxCode,
} from '../../../../../../../src/verticals/accounting/adapters/abacus-ch/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeAbacusTaxCode(overrides: Partial<AbacusTaxCode> = {}): AbacusTaxCode {
  return {
    Id: '10',
    Code: 'MWS81',
    Name: 'MwSt 8.1%',
    Description: 'Swiss standard VAT rate',
    Rate: 8.1,
    IsActive: true,
    CreatedAt: '2024-01-01T00:00:00.000Z',
    ModifiedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTaxRate (abacus-ch)', () => {
  it('maps Id as string', () => {
    const result = transformTaxRate(makeAbacusTaxCode({ Id: 10 }))
    expect(result.id).toBe('10')
  })

  it('prefers Name over Code for name field', () => {
    const result = transformTaxRate(makeAbacusTaxCode())
    expect(result.name).toBe('MwSt 8.1%')
  })

  it('falls back to Code when Name is absent', () => {
    const result = transformTaxRate(makeAbacusTaxCode({ Name: undefined }))
    expect(result.name).toBe('MWS81')
  })

  it('maps description', () => {
    const result = transformTaxRate(makeAbacusTaxCode())
    expect(result.description).toBe('Swiss standard VAT rate')
  })

  it('maps rate as percentage (not converted to minor units)', () => {
    const result = transformTaxRate(makeAbacusTaxCode({ Rate: 8.1 }))
    expect(result.rate).toBe(8.1)
  })

  it('maps IsActive correctly', () => {
    expect(transformTaxRate(makeAbacusTaxCode({ IsActive: true })).isActive).toBe(true)
    expect(transformTaxRate(makeAbacusTaxCode({ IsActive: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when IsActive is undefined', () => {
    const result = transformTaxRate(makeAbacusTaxCode({ IsActive: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('maps CreatedAt and ModifiedAt as Date', () => {
    const result = transformTaxRate(makeAbacusTaxCode())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    const result = transformTaxRate(makeAbacusTaxCode())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
