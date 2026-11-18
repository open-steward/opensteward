import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type PleoTaxCode,
} from '../../../../../../../src/verticals/accounting/adapters/pleo/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<PleoTaxCode> = {}): PleoTaxCode {
  return {
    id: 'tax-1',
    name: 'Standard VAT',
    code: 'VAT25',
    rate: 25,
    type: 'NORMAL',
    enabled: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('pleo transformTaxRate', () => {
  it('maps id', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('tax-1')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('Standard VAT')
  })

  it('maps code to description', () => {
    expect(transformTaxRate(makeRaw()).description).toBe('VAT25')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(25)
  })

  it('maps enabled=true to isActive=true', () => {
    expect(transformTaxRate(makeRaw({ enabled: true })).isActive).toBe(true)
  })

  it('maps enabled=false to isActive=false', () => {
    expect(transformTaxRate(makeRaw({ enabled: false })).isActive).toBe(false)
  })

  it('defaults isActive=true when enabled is absent', () => {
    expect(transformTaxRate(makeRaw({ enabled: undefined })).isActive).toBe(true)
  })

  it('maps createdAt to Date', () => {
    expect(transformTaxRate(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt to Date', () => {
    expect(transformTaxRate(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('passes TaxRateSchema.parse', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeRaw()))).not.toThrow()
  })
})
