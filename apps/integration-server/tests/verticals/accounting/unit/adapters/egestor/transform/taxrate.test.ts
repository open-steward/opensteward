import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type EgestorConfigTrib,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<EgestorConfigTrib> = {}): EgestorConfigTrib {
  return {
    codigo: 1,
    descricao: 'ICMS 18%',
    icmsAliquota: 18,
    pisAliquota: 0.65,
    ...overrides,
  }
}

describe('egestor transformTaxRate', () => {
  it('maps codigo to id as string', () => {
    const result = transformTaxRate(makeRaw({ codigo: 42 }))
    expect(result.id).toBe('42')
  })

  it('uses descricao as name', () => {
    const result = transformTaxRate(makeRaw({ descricao: 'IPI 5%' }))
    expect(result.name).toBe('IPI 5%')
  })

  it('falls back to codigo string when descricao absent', () => {
    const result = transformTaxRate(makeRaw({ descricao: undefined }))
    expect(result.name).toBe('1')
  })

  it('uses icmsAliquota as primary rate', () => {
    const result = transformTaxRate(makeRaw({ icmsAliquota: 18, pisAliquota: 0.65 }))
    expect(result.rate).toBe(18)
  })

  it('falls back to pisAliquota when icmsAliquota absent', () => {
    const result = transformTaxRate(makeRaw({ icmsAliquota: undefined, pisAliquota: 0.65 }))
    expect(result.rate).toBe(0.65)
  })

  it('rate is undefined when both are 0/absent', () => {
    // parseFloat("0") || undefined → undefined
    const result = transformTaxRate(makeRaw({ icmsAliquota: 0, pisAliquota: 0 }))
    expect(result.rate).toBeUndefined()
  })

  it('isActive is always true', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.isActive).toBe(true)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
