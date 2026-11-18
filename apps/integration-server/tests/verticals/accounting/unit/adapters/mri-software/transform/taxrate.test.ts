import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type MriTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/mri-software/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<MriTaxRate> = {}): MriTaxRate {
  return {
    id: 'tax-001',
    name: 'Standard VAT',
    description: 'UK Standard Rate',
    rate: 20,
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTaxRate (mri-software)', () => {
  it('maps id', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('Standard VAT')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeRaw()).description).toBe('UK Standard Rate')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(20)
  })

  it('maps isActive=true', () => {
    expect(transformTaxRate(makeRaw({ isActive: true })).isActive).toBe(true)
  })

  it('maps isActive=false', () => {
    expect(transformTaxRate(makeRaw({ isActive: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when undefined', () => {
    expect(transformTaxRate(makeRaw({ isActive: undefined })).isActive).toBe(true)
  })

  it('maps createdAt to Date', () => {
    expect(transformTaxRate(makeRaw()).createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeRaw()))).not.toThrow()
  })
})
