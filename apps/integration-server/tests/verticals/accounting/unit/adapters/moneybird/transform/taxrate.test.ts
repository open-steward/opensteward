import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type MoneybirdTaxRate } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/taxrate'

function makeTax(overrides: Partial<MoneybirdTaxRate> = {}): MoneybirdTaxRate {
  return { id: 700, name: 'Hoog tarief (21%)', percentage: '21', active: true, ...overrides }
}

describe('transformTaxRate (moneybird)', () => {
  it('maps id and name', () => {
    expect(transformTaxRate(makeTax()).id).toBe('700')
    expect(transformTaxRate(makeTax()).name).toBe('Hoog tarief (21%)')
  })
  it('maps rate from percentage string', () => { expect(transformTaxRate(makeTax()).rate).toBe(21) })
  it('active true → isActive true', () => { expect(transformTaxRate(makeTax()).isActive).toBe(true) })
  it('active false → isActive false', () => { expect(transformTaxRate(makeTax({ active: false })).isActive).toBe(false) })
  it('passes raw as metadata', () => {
    const raw = makeTax()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTax())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
