import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type KlaraTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<KlaraTaxRate> = {}): KlaraTaxRate {
  return {
    id: 'tax-1',
    name: 'MWST 8.1%',
    description: 'Standard Swiss VAT',
    rate: 8.1,
    is_active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps core fields', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('tax-1')
    expect(result.name).toBe('MWST 8.1%')
    expect(result.description).toBe('Standard Swiss VAT')
    expect(result.rate).toBe(8.1)
    expect(result.isActive).toBe(true)
  })

  it('maps is_active=false to isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when is_active is undefined', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: undefined })).isActive).toBe(true)
  })

  it('parses dates as Date objects', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes schema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeTaxRate()))).not.toThrow()
  })
})
