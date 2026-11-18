import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type TinyAliquota,
} from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<TinyAliquota> = {}): TinyAliquota {
  return {
    id: 7,
    descricao: 'ICMS 12%',
    percentual: 12.0,
    situacao: 1,
    ...overrides,
  }
}

describe('tiny transformTaxRate', () => {
  it('maps numeric id to string', () => {
    expect(transformTaxRate(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps string id to string', () => {
    expect(transformTaxRate(makeRaw({ id: 'tax-8' })).id).toBe('tax-8')
  })

  it('maps descricao to name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('ICMS 12%')
  })

  it('maps descricao to description as well', () => {
    expect(transformTaxRate(makeRaw()).description).toBe('ICMS 12%')
  })

  it('maps percentual to rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(12.0)
  })

  it('maps situacao=1 to isActive=true', () => {
    expect(transformTaxRate(makeRaw({ situacao: 1 })).isActive).toBe(true)
  })

  it('maps situacao=0 to isActive=false', () => {
    expect(transformTaxRate(makeRaw({ situacao: 0 })).isActive).toBe(false)
  })

  it('maps null situacao to isActive=false', () => {
    expect(transformTaxRate(makeRaw({ situacao: null })).isActive).toBe(false)
  })

  it('passes TaxRateSchema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('handles null id gracefully', () => {
    expect(transformTaxRate(makeRaw({ id: null })).id).toBeUndefined()
  })
})
