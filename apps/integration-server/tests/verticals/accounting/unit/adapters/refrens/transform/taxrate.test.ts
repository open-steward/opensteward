import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type RefrensTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/refrens/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<RefrensTaxRate> = {}): RefrensTaxRate {
  return {
    id: 'tax_gst18',
    name: 'GST 18%',
    rate: 18,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id', () => {
    const result = transformTaxRate(makeTaxRate({ id: 'tax_xyz' }))
    expect(result.id).toBe('tax_xyz')
  })

  it('maps name', () => {
    const result = transformTaxRate(makeTaxRate({ name: 'GST 5%' }))
    expect(result.name).toBe('GST 5%')
  })

  it('returns undefined name when name is absent', () => {
    const result = transformTaxRate(makeTaxRate({ name: undefined }))
    expect(result.name).toBeUndefined()
  })

  it('maps rate', () => {
    const result = transformTaxRate(makeTaxRate({ rate: 28 }))
    expect(result.rate).toBe(28)
  })

  it('returns undefined rate when rate is absent', () => {
    const result = transformTaxRate(makeTaxRate({ rate: undefined }))
    expect(result.rate).toBeUndefined()
  })

  it('passes raw object through as metadata (reference equality)', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies TaxRateSchema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
