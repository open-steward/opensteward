import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type EconomicVatAccount } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/taxrate'

function makeRaw(overrides: Partial<EconomicVatAccount> = {}): EconomicVatAccount {
  return {
    vatCode: 'S25',
    name: 'Sales Tax 25%',
    ratePercentage: 25,
    ...overrides,
  }
}

describe('economic transformTaxRate', () => {
  it('maps vatCode to id', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('S25')
  })
  it('handles fields gracefully', () => {
    expect(() => transformTaxRate(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })
  it('maps name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('Sales Tax 25%')
  })
  it('maps ratePercentage to rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(25)
  })
  it('always sets isActive to true', () => {
    expect(transformTaxRate(makeRaw()).isActive).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
