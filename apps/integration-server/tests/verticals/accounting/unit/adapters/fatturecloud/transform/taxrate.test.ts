import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type FattureCloudTaxRate } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/taxrate'

function makeTax(overrides: Partial<FattureCloudTaxRate> = {}): FattureCloudTaxRate {
  return { id: 40, value: 22, description: 'IVA 22%', is_disabled: false, ...overrides }
}

describe('transformTaxRate (fatturecloud)', () => {
  it('maps id and name', () => {
    expect(transformTaxRate(makeTax()).id).toBe('40')
    expect(transformTaxRate(makeTax()).name).toBe('IVA 22%')
  })
  it('maps rate from value', () => { expect(transformTaxRate(makeTax()).rate).toBe(22) })
  it('is_disabled false → isActive true', () => { expect(transformTaxRate(makeTax()).isActive).toBe(true) })
  it('is_disabled true → isActive false', () => { expect(transformTaxRate(makeTax({ is_disabled: true })).isActive).toBe(false) })
  it('passes raw as metadata', () => {
    const raw = makeTax()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTax())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
