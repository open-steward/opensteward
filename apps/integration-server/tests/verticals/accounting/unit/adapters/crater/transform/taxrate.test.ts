import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type CraterTaxType,
} from '../../../../../../../src/verticals/accounting/adapters/crater/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<CraterTaxType> = {}): CraterTaxType {
  return {
    id: 'tax-5',
    name: 'Standard VAT',
    percent: 20,
    description: '20% standard VAT',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTaxRate (crater)', () => {
  it('maps id and name', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('tax-5')
    expect(result.name).toBe('Standard VAT')
  })

  it('maps rate from percent', () => {
    expect(transformTaxRate(makeTaxRate({ percent: 20 })).rate).toBe(20)
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('20% standard VAT')
  })

  it('always sets isActive to true (no archive flag on Crater tax types)', () => {
    expect(transformTaxRate(makeTaxRate()).isActive).toBe(true)
  })

  it('parses createdAt and updatedAt as Dates', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('omits description when not provided', () => {
    expect(transformTaxRate(makeTaxRate({ description: undefined })).description).toBeUndefined()
  })

  it('attaches raw as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
