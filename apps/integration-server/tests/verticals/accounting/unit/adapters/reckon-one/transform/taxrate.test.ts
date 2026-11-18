import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type ReckonOneTaxCode,
} from '../../../../../../../src/verticals/accounting/adapters/reckon-one/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxCode(overrides: Partial<ReckonOneTaxCode> = {}): ReckonOneTaxCode {
  return {
    id: 'tax_001',
    name: 'GST',
    description: 'Goods & Services Tax 10%',
    rate: 10,
    isActive: true,
    createdDateTime: '2020-01-01T00:00:00Z',
    modifiedDateTime: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id', () => {
    expect(transformTaxRate(makeTaxCode()).id).toBe('tax_001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxCode()).name).toBe('GST')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxCode()).description).toBe('Goods & Services Tax 10%')
  })

  it('maps rate directly (already a percentage number)', () => {
    expect(transformTaxRate(makeTaxCode()).rate).toBe(10)
  })

  it('maps isActive=true', () => {
    expect(transformTaxRate(makeTaxCode({ isActive: true })).isActive).toBe(true)
  })

  it('maps isActive=false', () => {
    expect(transformTaxRate(makeTaxCode({ isActive: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when absent', () => {
    expect(transformTaxRate(makeTaxCode({ isActive: undefined })).isActive).toBe(true)
  })

  it('maps createdDateTime to createdAt', () => {
    expect(transformTaxRate(makeTaxCode()).createdAt).toEqual(new Date('2020-01-01T00:00:00Z'))
  })

  it('maps modifiedDateTime to updatedAt', () => {
    expect(transformTaxRate(makeTaxCode()).updatedAt).toEqual(new Date('2024-01-01T00:00:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxCode()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces output that passes TaxRateSchema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeTaxCode()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformTaxRate({ id: 'tax_001' })
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
