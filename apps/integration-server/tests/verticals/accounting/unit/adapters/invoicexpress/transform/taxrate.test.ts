import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type InvoiceXpressTaxRate } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/taxrate'

function makeTaxRate(overrides: Partial<InvoiceXpressTaxRate> = {}): InvoiceXpressTaxRate {
  return {
    id: 8,
    name: 'IVA Normal',
    value: 23,
    region: 'PT',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('8')
    expect(result.name).toBe('IVA Normal')
    expect(result.rate).toBe(23)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate({ name: 'IVA Reduzido' })
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps reduced rate correctly', () => {
    const result = transformTaxRate(makeTaxRate({ value: 6, name: 'IVA Reduzido' }))
    expect(result.rate).toBe(6)
  })

  it('maps intermediate rate correctly', () => {
    const result = transformTaxRate(makeTaxRate({ value: 13, name: 'IVA Intermédio' }))
    expect(result.rate).toBe(13)
  })

  it('returns undefined name when empty', () => {
    const result = transformTaxRate(makeTaxRate({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
