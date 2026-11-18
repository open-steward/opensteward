import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type BillomatTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/taxrate'

function makeTaxRate(overrides: Partial<BillomatTaxRate> = {}): BillomatTaxRate {
  return {
    id: 'tax-001',
    name: 'Mehrwertsteuer 19%',
    rate: 19,
    is_default: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Mehrwertsteuer 19%')
  })

  it('converts rate to decimal (19 → 0.19)', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(0.19)
  })

  it('converts rate 7 to decimal (7 → 0.07)', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 7 })).rate).toBe(0.07)
  })

  it('converts zero rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 0 })).rate).toBe(0)
  })

  it('maps isActive when is_default is set', () => {
    expect(transformTaxRate(makeTaxRate({ is_default: true })).isActive).toBe(true)
  })

  it('returns undefined name when empty', () => {
    expect(transformTaxRate(makeTaxRate({ name: '' })).name).toBeUndefined()
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
