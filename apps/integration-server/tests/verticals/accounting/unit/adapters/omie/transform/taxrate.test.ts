import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type OmieTaxRate } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/taxrate'

function makeRaw(overrides: Partial<OmieTaxRate> = {}): OmieTaxRate {
  return {
    codigo_imposto: 3,
    nome: 'PIS',
    descricao: 'Programa de Integração Social',
    aliquota: 0.65,
    ativo: 'S',
    ...overrides,
  }
}

describe('omie transformTaxRate', () => {
  it('maps codigo_imposto to id as string', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('3')
  })

  it('maps nome to name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('PIS')
  })

  it('maps descricao to description', () => {
    expect(transformTaxRate(makeRaw()).description).toBe('Programa de Integração Social')
  })

  it('maps aliquota to rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(0.65)
  })

  it('maps ativo=S to isActive=true', () => {
    expect(transformTaxRate(makeRaw({ ativo: 'S' })).isActive).toBe(true)
  })

  it('maps ativo=N to isActive=false', () => {
    expect(transformTaxRate(makeRaw({ ativo: 'N' })).isActive).toBe(false)
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
