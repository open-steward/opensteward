import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type NuvemFiscalAliquota } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/taxrate'

function makeRaw(overrides: Partial<NuvemFiscalAliquota> = {}): NuvemFiscalAliquota {
  return {
    id_aliquota: 2,
    nome: 'ICMS',
    descricao: 'Imposto sobre circulação',
    percentual: 12,
    ativa: true,
    ...overrides,
  }
}

describe('nuvemfiscal transformTaxRate', () => {
  it('maps id_aliquota to id as string', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('2')
  })

  it('maps nome to name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('ICMS')
  })

  it('maps descricao to description', () => {
    expect(transformTaxRate(makeRaw()).description).toBe('Imposto sobre circulação')
  })

  it('maps percentual to rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(12)
  })

  it('maps ativa=true to isActive=true', () => {
    expect(transformTaxRate(makeRaw({ ativa: true })).isActive).toBe(true)
  })

  it('maps ativa=false to isActive=false', () => {
    expect(transformTaxRate(makeRaw({ ativa: false })).isActive).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformTaxRate(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
