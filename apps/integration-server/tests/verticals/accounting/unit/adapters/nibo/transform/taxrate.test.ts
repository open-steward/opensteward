import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type NiboTaxRate } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/taxrate'

function makeRaw(overrides: Partial<NiboTaxRate> = {}): NiboTaxRate {
  return {
    taxRateId: 1,
    name: 'ICMS',
    description: 'Imposto sobre Circulação de Mercadorias',
    rate: 12,
    isActive: true,
    ...overrides,
  }
}

describe('nibo transformTaxRate', () => {
  it('maps taxRateId to id as string', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformTaxRate(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })
  it('maps name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('ICMS')
  })
  it('maps rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(12)
  })
  it('maps isActive false -> false', () => {
    expect(transformTaxRate(makeRaw({ isActive: false })).isActive).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
