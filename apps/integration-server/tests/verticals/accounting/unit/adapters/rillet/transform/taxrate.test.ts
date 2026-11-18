import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type RilletTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/rillet/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<RilletTaxRate> = {}): RilletTaxRate {
  return {
    id: 'tax_ca_state',
    code: 'CA_STATE',
    country: 'US',
    description: 'California state sales tax',
    percentage: '8.75',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id directly', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax_ca_state')
  })

  it('maps code to name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('CA_STATE')
  })

  it('maps description directly', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('California state sales tax')
  })

  it('converts percentage string to float rate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(8.75)
  })

  it('always sets isActive to true', () => {
    expect(transformTaxRate(makeTaxRate()).isActive).toBe(true)
  })

  it('handles integer percentage string', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: '10' })).rate).toBe(10)
  })

  it('yields undefined name when code is empty string', () => {
    expect(transformTaxRate(makeTaxRate({ code: '' })).name).toBeUndefined()
  })

  it('yields undefined description when description is empty string', () => {
    expect(transformTaxRate(makeTaxRate({ description: '' })).description).toBeUndefined()
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces output that passes TaxRateSchema validation', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
