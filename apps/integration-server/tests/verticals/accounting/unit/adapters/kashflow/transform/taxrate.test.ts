import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type KashflowTax,
} from '../../../../../../../src/verticals/accounting/adapters/kashflow/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<KashflowTax> = {}): KashflowTax {
  return {
    Code: 'T1',
    Description: 'Standard Rate',
    Id: 1,
    Rate: 20,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('uses Code as id when Code is present', () => {
    expect(transformTaxRate(makeTaxRate({ Code: 'T1' })).id).toBe('T1')
  })

  it('falls back to String(Id) when Code is absent', () => {
    expect(transformTaxRate(makeTaxRate({ Code: undefined, Id: 1 })).id).toBe('1')
  })

  it('returns undefined id when both Code and Id are absent', () => {
    expect(transformTaxRate(makeTaxRate({ Code: undefined, Id: undefined })).id).toBeUndefined()
  })

  it('treats a JSON null Id as no Id, not as the id "null"', () => {
    const raw = { ...makeTaxRate({ Code: undefined }), Id: null } as unknown as KashflowTax
    expect(transformTaxRate(raw).id).toBeUndefined()
  })

  it('maps Description to name', () => {
    expect(transformTaxRate(makeTaxRate({ Description: 'Standard Rate' })).name).toBe(
      'Standard Rate',
    )
  })

  it('maps Description to description', () => {
    expect(transformTaxRate(makeTaxRate({ Description: 'Standard Rate' })).description).toBe(
      'Standard Rate',
    )
  })

  it('maps Rate directly (no unit conversion — already a percentage)', () => {
    expect(transformTaxRate(makeTaxRate({ Rate: 20 })).rate).toBe(20)
  })

  it('maps fractional Rate without modification', () => {
    expect(transformTaxRate(makeTaxRate({ Rate: 5.5 })).rate).toBe(5.5)
  })

  it('always sets isActive to true', () => {
    expect(transformTaxRate(makeTaxRate()).isActive).toBe(true)
  })

  it('sets name and description to undefined when Description is absent', () => {
    const result = transformTaxRate(makeTaxRate({ Description: undefined }))
    expect(result.name).toBeUndefined()
    expect(result.description).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces output that passes TaxRateSchema validation', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
