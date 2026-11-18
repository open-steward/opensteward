import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type MisaAmisTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/taxrate'

function makeRaw(overrides: Partial<MisaAmisTaxRate> = {}): MisaAmisTaxRate {
  return {
    id: 'tax-001',
    tax_name: 'VAT 10%',
    tax_rate: 10,
    tax_code: 'VAT10',
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('tax-001')
    expect(result.name).toBe('VAT 10%')
    expect(result.description).toBe('VAT10')
    expect(result.rate).toBe(10)
    expect(result.isActive).toBe(true)
  })

  it('maps is_active false correctly', () => {
    const result = transformTaxRate(makeRaw({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('maps different tax rates', () => {
    expect(transformTaxRate(makeRaw({ tax_rate: 0 })).rate).toBe(0)
    expect(transformTaxRate(makeRaw({ tax_rate: 5 })).rate).toBe(5)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
