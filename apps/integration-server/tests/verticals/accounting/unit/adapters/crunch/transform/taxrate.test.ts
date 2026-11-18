import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type CrunchVatType,
} from '../../../../../../../src/verticals/accounting/adapters/crunch/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<CrunchVatType> = {}): CrunchVatType {
  return {
    name: 'STANDARD',
    displayName: 'Standard Rate (20%)',
    vatPercent: 20,
    ...overrides,
  }
}

describe('transformTaxRate (crunch)', () => {
  it('uses name (internal code) as id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('STANDARD')
  })

  it('uses displayName as name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard Rate (20%)')
  })

  it('falls back to name when displayName is absent', () => {
    expect(transformTaxRate(makeTaxRate({ displayName: undefined })).name).toBe('STANDARD')
  })

  it('maps vatPercent to rate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(20)
  })

  it('always sets isActive to true', () => {
    expect(transformTaxRate(makeTaxRate()).isActive).toBe(true)
  })

  it('attaches raw as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
