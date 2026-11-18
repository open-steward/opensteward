import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type FreeAgentTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/taxrate'

function makeTaxRate(overrides: Partial<FreeAgentTaxRate> = {}): FreeAgentTaxRate {
  return {
    url: 'https://api.freeagent.com/v2/tax_rates/101',
    name: 'Standard Rate',
    percentage: '20.0',
    is_default: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('extracts id from url', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('101')
  })

  it('maps name correctly', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard Rate')
  })

  it('parses percentage as rate number', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(20)
  })

  it('parses decimal percentage correctly', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: '5.5' })).rate).toBe(5.5)
  })

  it('sets isActive to true', () => {
    expect(transformTaxRate(makeTaxRate()).isActive).toBe(true)
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
