import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type FreshBooksTax,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/taxrate'

function makeTax(overrides: Partial<FreshBooksTax> = {}): FreshBooksTax {
  return {
    taxid: 11,
    name: 'GST',
    number: 'TAX-001',
    amount: '5.00',
    compound: false,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps taxid to id (number to string)', () => {
    expect(transformTaxRate(makeTax()).id).toBe('11')
  })

  it('maps name correctly', () => {
    expect(transformTaxRate(makeTax()).name).toBe('GST')
  })

  it('maps number to description', () => {
    expect(transformTaxRate(makeTax()).description).toBe('TAX-001')
  })

  it('parses amount string to float for rate', () => {
    expect(transformTaxRate(makeTax()).rate).toBe(5)
  })

  it('handles decimal rate correctly', () => {
    expect(transformTaxRate(makeTax({ amount: '7.5' })).rate).toBe(7.5)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTax()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTax())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
