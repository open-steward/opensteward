import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type SevDeskUnity,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/taxrate'

function makeTaxRate(overrides: Partial<SevDeskUnity> = {}): SevDeskUnity {
  return {
    id: 'tax-1',
    name: 'Standard VAT',
    taxRate: '19',
    status: '100',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id correctly', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-1')
  })

  it('maps name correctly', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard VAT')
  })

  it('parses taxRate string as number', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(19)
  })

  it('parses decimal taxRate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ taxRate: '7.5' })).rate).toBe(7.5)
  })

  it('maps status 100 to isActive true', () => {
    expect(transformTaxRate(makeTaxRate({ status: '100' })).isActive).toBe(true)
  })

  it('maps non-100 status to isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ status: '200' })).isActive).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
