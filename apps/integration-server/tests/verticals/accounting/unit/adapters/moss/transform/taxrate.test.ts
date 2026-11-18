import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type MossTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/moss/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<MossTaxRate> = {}): MossTaxRate {
  return {
    id: 'vat-001',
    organisationId: 'org-001',
    type: 'VAT',
    country: 'DE',
    name: 'German Standard VAT',
    rate: 19,
    code: 'DE19',
    status: 'ACTIVE',
    createTime: '2024-01-01T00:00:00.000Z',
    updateTime: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTaxRate (moss)', () => {
  it('maps id', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('vat-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('German Standard VAT')
  })

  it('builds description from type + code', () => {
    expect(transformTaxRate(makeRaw()).description).toBe('VAT DE19')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(19)
  })

  it('maps ACTIVE status → isActive true', () => {
    expect(transformTaxRate(makeRaw({ status: 'ACTIVE' })).isActive).toBe(true)
  })

  it('maps non-ACTIVE status → isActive false', () => {
    expect(transformTaxRate(makeRaw({ status: 'ARCHIVED' })).isActive).toBe(false)
  })

  it('maps createTime to createdAt Date', () => {
    expect(transformTaxRate(makeRaw()).createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeRaw()))).not.toThrow()
  })
})
