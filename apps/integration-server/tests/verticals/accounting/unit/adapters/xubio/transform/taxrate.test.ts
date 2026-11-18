import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type XubioTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/taxrate'

function makeTaxRate(overrides: Partial<XubioTaxRate> = {}): XubioTaxRate {
  return {
    id: 7,
    nombre: 'IVA 21%',
    descripcion: 'Impuesto al Valor Agregado 21%',
    porcentaje: 21,
    activo: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id as string', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('7')
  })

  it('maps nombre to name', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.name).toBe('IVA 21%')
  })

  it('maps descripcion to description', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.description).toBe('Impuesto al Valor Agregado 21%')
  })

  it('maps porcentaje to rate', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.rate).toBe(21)
  })

  it('maps activo=true to isActive true', () => {
    const result = transformTaxRate(makeTaxRate({ activo: true }))
    expect(result.isActive).toBe(true)
  })

  it('maps activo=false to isActive false', () => {
    const result = transformTaxRate(makeTaxRate({ activo: false }))
    expect(result.isActive).toBe(false)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
