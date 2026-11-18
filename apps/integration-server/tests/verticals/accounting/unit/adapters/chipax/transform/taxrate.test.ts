import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type ChipaxTaxRate } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/taxrate'

function makeTaxRate(overrides: Partial<ChipaxTaxRate> = {}): ChipaxTaxRate {
  return {
    id: 1,
    nombre: 'IVA',
    descripcion: 'Impuesto al valor agregado',
    tasa: 19,
    activo: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('1')
    expect(result.name).toBe('IVA')
    expect(result.description).toBe('Impuesto al valor agregado')
    expect(result.rate).toBe(19)
    expect(result.isActive).toBe(true)
  })

  it('maps inactive tax rate', () => {
    const result = transformTaxRate(makeTaxRate({ activo: false }))
    expect(result.isActive).toBe(false)
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
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
