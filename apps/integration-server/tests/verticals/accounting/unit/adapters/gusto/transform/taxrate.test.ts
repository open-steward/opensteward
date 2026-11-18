import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type GustoTaxRate } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/taxrate'

function makeTaxRate(overrides: Partial<GustoTaxRate> = {}): GustoTaxRate {
  return {
    id: 'tr_001',
    name: 'Federal Income Tax',
    rate: 0.22,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformTaxRate(makeTaxRate({ id: 'tr_001' })).id).toBe('tr_001')
  })

  it('maps numeric id to string', () => {
    expect(transformTaxRate(makeTaxRate({ id: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate({ name: 'FICA' })).name).toBe('FICA')
  })

  it('maps numeric rate', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 0.15 })).rate).toBe(0.15)
  })

  it('parses string rate', () => {
    expect(transformTaxRate(makeTaxRate({ rate: '0.075' })).rate).toBe(0.075)
  })

  it('maps is_active true', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active false', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when absent', () => {
    const raw = makeTaxRate()
    delete raw.is_active
    expect(transformTaxRate(raw).isActive).toBe(true)
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate({ id: 'tr_001' }))
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
