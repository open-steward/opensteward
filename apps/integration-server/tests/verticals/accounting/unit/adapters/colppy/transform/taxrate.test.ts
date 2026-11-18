import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type ColppyTaxRate } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/taxrate'

function makeTaxRate(overrides: Partial<ColppyTaxRate> = {}): ColppyTaxRate {
  return {
    idAlicuota: 1,
    nombre: 'IVA 21%',
    descripcion: 'Impuesto al Valor Agregado',
    porcentaje: 21,
    activa: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('1')
    expect(result.name).toBe('IVA 21%')
    expect(result.description).toBe('Impuesto al Valor Agregado')
    expect(result.rate).toBe(21)
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps active state', () => {
    const result = transformTaxRate(makeTaxRate({ activa: true }))
    expect(result.isActive).toBe(true)
  })

  it('maps inactive state', () => {
    const result = transformTaxRate(makeTaxRate({ activa: false }))
    expect(result.isActive).toBe(false)
  })

  it('returns undefined name when nombre is empty', () => {
    const result = transformTaxRate(makeTaxRate({ nombre: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
