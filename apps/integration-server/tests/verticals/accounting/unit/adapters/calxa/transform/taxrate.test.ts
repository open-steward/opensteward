import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type CalxaTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<CalxaTaxRate> = {}): CalxaTaxRate {
  return {
    id: 'tax-001',
    name: 'GST10',
    description: 'Goods and Services Tax 10%',
    rate: 10,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id as-is', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('GST10')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('Goods and Services Tax 10%')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(10)
  })

  it('maps isActive=true', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: true })).isActive).toBe(true)
  })

  it('maps isActive=false', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: false })).isActive).toBe(false)
  })

  it('returns undefined isActive when isActive is undefined', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: undefined })).isActive).toBeUndefined()
  })

  it('returns undefined name when name is undefined', () => {
    expect(transformTaxRate(makeTaxRate({ name: undefined })).name).toBeUndefined()
  })

  it('maps createdAt to Date', () => {
    const result = transformTaxRate(makeTaxRate({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformTaxRate(makeTaxRate({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeTaxRate()))).not.toThrow()
  })
})
