import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type TallyTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/taxrate'

function makeTaxRate(overrides: Partial<TallyTaxRate> = {}): TallyTaxRate {
  return {
    NAME: 'GST@18',
    TAXTYPE: 'GST',
    PERCENTAGE: '18',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps NAME to id and name', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('GST@18')
    expect(result.name).toBe('GST@18')
  })

  it('maps TAXTYPE to description', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.description).toBe('GST')
  })

  it('divides PERCENTAGE by 100 for rate', () => {
    const result = transformTaxRate(makeTaxRate({ PERCENTAGE: '18' }))
    expect(result.rate).toBeCloseTo(0.18)
  })

  it('sets rate to undefined when PERCENTAGE is not a number', () => {
    const result = transformTaxRate(makeTaxRate({ PERCENTAGE: 'N/A' }))
    expect(result.rate).toBeUndefined()
  })

  it('always sets isActive to true', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.isActive).toBe(true)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
