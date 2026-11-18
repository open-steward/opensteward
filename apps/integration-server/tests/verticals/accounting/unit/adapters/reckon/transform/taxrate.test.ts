import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type ReckonTaxCode } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/taxrate'

function makeRaw(overrides: Partial<ReckonTaxCode> = {}): ReckonTaxCode {
  return {
    id: 'taxcode-gst',
    name: 'GST',
    rate: 10,
    type: 'GST',
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('taxcode-gst')
    expect(result.name).toBe('GST')
    expect(result.rate).toBe(10)
    expect(result.isActive).toBe(true)
    expect(result.description).toBe('GST')
  })

  it('maps inactive tax rate', () => {
    const result = transformTaxRate(makeRaw({ isActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('maps zero-rate tax code', () => {
    const result = transformTaxRate(makeRaw({ id: 'taxcode-exempt', name: 'EXEMPT', rate: 0, type: 'EXEMPT' }))
    expect(result.id).toBe('taxcode-exempt')
    expect(result.rate).toBe(0)
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
