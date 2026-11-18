import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type VhsysTributacao,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTributacao(overrides: Partial<VhsysTributacao> = {}): VhsysTributacao {
  return {
    id_tributacao: 5,
    descricao_tributacao: 'Simples Nacional',
    aliquota: '6.5',
    situacao: 'A',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTributacao())
    expect(result.id).toBe('5')
    expect(result.name).toBe('Simples Nacional')
    expect(result.description).toBe('Simples Nacional')
    expect(result.rate).toBe(6.5)
    expect(result.isActive).toBe(true)
  })

  it('maps situacao I to isActive=false', () => {
    const result = transformTaxRate(makeTributacao({ situacao: 'I' }))
    expect(result.isActive).toBe(false)
  })

  it('maps situacao A to isActive=true', () => {
    const result = transformTaxRate(makeTributacao({ situacao: 'A' }))
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive=true when situacao absent', () => {
    const result = transformTaxRate(makeTributacao({ situacao: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('converts string aliquota to number', () => {
    const result = transformTaxRate(makeTributacao({ aliquota: '12.5' }))
    expect(result.rate).toBe(12.5)
  })

  it('handles numeric aliquota', () => {
    const result = transformTaxRate(makeTributacao({ aliquota: 20 }))
    expect(result.rate).toBe(20)
  })

  it('passes raw as metadata', () => {
    const raw = makeTributacao()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformTaxRate(makeTributacao())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
