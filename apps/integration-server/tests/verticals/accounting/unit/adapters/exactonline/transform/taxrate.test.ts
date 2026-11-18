import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type ExactTaxCode } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/taxrate'

function makeTax(overrides: Partial<ExactTaxCode> = {}): ExactTaxCode {
  return { ID: 'tax-1', Code: 'BTW21', Description: 'BTW 21%', VATPercentage: 21, IsBlocked: false, ...overrides }
}

describe('transformTaxRate (exactonline)', () => {
  it('maps id and name from Code', () => {
    const r = transformTaxRate(makeTax())
    expect(r.id).toBe('tax-1')
    expect(r.name).toBe('BTW21')
  })
  it('maps description', () => {
    expect(transformTaxRate(makeTax()).description).toBe('BTW 21%')
  })
  it('maps rate', () => {
    expect(transformTaxRate(makeTax()).rate).toBe(21)
  })
  it('IsBlocked false → isActive true', () => {
    expect(transformTaxRate(makeTax({ IsBlocked: false })).isActive).toBe(true)
  })
  it('IsBlocked true → isActive false', () => {
    expect(transformTaxRate(makeTax({ IsBlocked: true })).isActive).toBe(false)
  })
  it('passes raw as metadata', () => {
    const raw = makeTax()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTax())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
