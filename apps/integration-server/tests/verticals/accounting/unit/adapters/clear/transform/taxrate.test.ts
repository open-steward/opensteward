import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type ClearGSTRate,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/taxrate'

function makeRaw(overrides: Partial<ClearGSTRate> = {}): ClearGSTRate {
  return {
    id: 'gst-uuid-001',
    name: 'GST 18%',
    rate: 18,
    hsn_code: '998314',
    type: 'IGST',
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (clear)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('gst-uuid-001')
    expect(result.name).toBe('GST 18%')
    expect(result.rate).toBe(18)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('includes type and hsn_code in description', () => {
    const result = transformTaxRate(makeRaw({ type: 'CGST', hsn_code: '9983' }))
    expect(result.description).toContain('CGST')
    expect(result.description).toContain('9983')
  })

  it('maps zero rate correctly', () => {
    const result = transformTaxRate(makeRaw({ rate: 0, name: 'Exempt' }))
    expect(result.rate).toBe(0)
    expect(result.name).toBe('Exempt')
  })

  it('maps is_active false correctly', () => {
    const result = transformTaxRate(makeRaw({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
