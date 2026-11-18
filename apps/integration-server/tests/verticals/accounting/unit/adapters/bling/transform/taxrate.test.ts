import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type BlingImposto,
} from '../../../../../../../src/verticals/accounting/adapters/bling/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<BlingImposto> = {}): BlingImposto {
  return {
    id: 50,
    descricao: 'ICMS 12%',
    aliquota: 12,
    situacao: 1,
    tipo: 'ICMS',
    ...overrides,
  }
}

describe('transformTaxRate (bling)', () => {
  it('maps id to string', () => {
    const result = transformTaxRate(makeTaxRate({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps descricao to name', () => {
    const result = transformTaxRate(makeTaxRate({ descricao: 'IPI 5%' }))
    expect(result.name).toBe('IPI 5%')
  })

  it('builds description as "tipo — descricao" when both present', () => {
    const result = transformTaxRate(makeTaxRate({ tipo: 'ICMS', descricao: 'ICMS 12%' }))
    expect(result.description).toBe('ICMS — ICMS 12%')
  })

  it('builds description as just tipo when descricao is absent', () => {
    const result = transformTaxRate(makeTaxRate({ tipo: 'PIS', descricao: undefined }))
    expect(result.description).toBe('PIS')
  })

  it('uses descricao as description when tipo is absent', () => {
    const result = transformTaxRate(makeTaxRate({ tipo: undefined, descricao: 'ISS Municipal' }))
    expect(result.description).toBe('ISS Municipal')
  })

  it('omits description when both tipo and descricao are absent', () => {
    const result = transformTaxRate(makeTaxRate({ tipo: undefined, descricao: undefined }))
    expect(result.description).toBeUndefined()
  })

  it('maps aliquota to rate', () => {
    const result = transformTaxRate(makeTaxRate({ aliquota: 7.5 }))
    expect(result.rate).toBe(7.5)
  })

  it('marks isActive=true when situacao=1', () => {
    const result = transformTaxRate(makeTaxRate({ situacao: 1 }))
    expect(result.isActive).toBe(true)
  })

  it('marks isActive=false when situacao=2', () => {
    const result = transformTaxRate(makeTaxRate({ situacao: 2 }))
    expect(result.isActive).toBe(false)
  })

  it('marks isActive=true when situacao is undefined', () => {
    const result = transformTaxRate(makeTaxRate({ situacao: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('passes raw as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('result passes TaxRateSchema validation', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })

  it('result with minimal input passes TaxRateSchema validation', () => {
    const result = transformTaxRate({ id: 1 })
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
