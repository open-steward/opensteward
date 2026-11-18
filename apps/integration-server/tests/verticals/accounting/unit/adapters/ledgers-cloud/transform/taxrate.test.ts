import { describe, it, expect } from 'vitest'
import { transformTaxRate } from '../../../../../../../src/verticals/accounting/adapters/ledgers-cloud/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

const base = {
  id: 'tx-1',
  name: 'GST 18%',
  description: 'Goods and Services Tax',
  rate: 18,
  is_active: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

describe('transformTaxRate', () => {
  it('maps core fields', () => {
    const result = transformTaxRate(base)
    expect(result.id).toBe('tx-1')
    expect(result.name).toBe('GST 18%')
    expect(result.description).toBe('Goods and Services Tax')
    expect(result.rate).toBe(18)
    expect(result.isActive).toBe(true)
  })

  it('falls back to percentage field when rate absent', () => {
    const result = transformTaxRate({ ...base, rate: undefined, percentage: 5 })
    expect(result.rate).toBe(5)
  })

  it('maps is_active=false to isActive false', () => {
    expect(transformTaxRate({ ...base, is_active: false }).isActive).toBe(false)
  })

  it('uses status field for isActive when is_active absent', () => {
    const result = transformTaxRate({ ...base, is_active: undefined, status: 'active' })
    expect(result.isActive).toBe(true)
  })

  it('parses dates as Date objects', () => {
    const result = transformTaxRate(base)
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes schema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(base))).not.toThrow()
  })
})
