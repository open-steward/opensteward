import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type EBoekhoudenTaxRate } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/taxrate'

function makeTaxRate(overrides: Partial<EBoekhoudenTaxRate> = {}): EBoekhoudenTaxRate {
  return {
    code: 'BTW21',
    description: 'BTW 21%',
    percentage: 21,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (eboekhouden)', () => {
  it('maps id from code', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('BTW21')
  })

  it('maps name from description', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('BTW 21%')
  })

  it('maps rate from percentage', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(21)
  })

  it('isActive defaults to true', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: undefined })).isActive).toBe(true)
  })

  it('maps isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: false })).isActive).toBe(false)
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
