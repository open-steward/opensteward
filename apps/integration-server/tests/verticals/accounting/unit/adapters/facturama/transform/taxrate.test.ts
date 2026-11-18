import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type FacturamaTaxRate } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/taxrate'

function makeRaw(overrides: Partial<FacturamaTaxRate> = {}): FacturamaTaxRate {
  return {
    Id: 'tax-1',
    Name: 'IVA 16%',
    Description: 'Impuesto al Valor Agregado',
    Rate: 16,
    IsActive: true,
    ...overrides,
  }
}

describe('facturama transformTaxRate', () => {
  it('maps Id to id', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('tax-1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformTaxRate(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })
  it('maps Name to name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('IVA 16%')
  })
  it('maps Rate to rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(16)
  })
  it('maps IsActive false -> false', () => {
    expect(transformTaxRate(makeRaw({ IsActive: false })).isActive).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
