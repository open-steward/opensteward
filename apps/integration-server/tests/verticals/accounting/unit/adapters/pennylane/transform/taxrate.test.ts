import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type PennylaneTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/taxrate'

function makeTaxRate(overrides: Partial<PennylaneTaxRate> = {}): PennylaneTaxRate {
  return {
    id: 'tax-1',
    label: 'TVA 20%',
    rate: 20,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id correctly', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-1')
  })

  it('maps label to name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('TVA 20%')
  })

  it('maps rate correctly', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(20)
  })

  it('maps a different rate value correctly', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 5.5 })).rate).toBe(5.5)
  })

  it('returns undefined name when label is empty', () => {
    expect(transformTaxRate(makeTaxRate({ label: '' })).name).toBeUndefined()
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
