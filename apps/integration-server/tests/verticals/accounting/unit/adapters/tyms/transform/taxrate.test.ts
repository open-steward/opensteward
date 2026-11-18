import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type TymsTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/tyms/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<TymsTaxRate> = {}): TymsTaxRate {
  return {
    uuid: 'tax-001',
    name: 'Standard VAT',
    percentage: 20,
    currency: 'USD',
    is_deductable: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('tax-001')
    expect(result.name).toBe('Standard VAT')
    expect(result.rate).toBe(20)
    expect(result.isActive).toBe(true)
  })

  it('always sets isActive=true (Tyms has no active flag)', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.isActive).toBe(true)
  })

  it('maps name to description as well', () => {
    const result = transformTaxRate(makeTaxRate({ name: 'Reduced Rate' }))
    expect(result.description).toBe('Reduced Rate')
  })

  it('handles missing percentage', () => {
    const result = transformTaxRate(makeTaxRate({ percentage: undefined }))
    expect(result.rate).toBeUndefined()
  })

  it('parses dates as Date objects', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes raw as metadata', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
