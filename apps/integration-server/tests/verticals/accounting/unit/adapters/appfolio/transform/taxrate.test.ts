import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type AppFolioTaxRate } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/taxrate'

function makeTaxRate(overrides: Partial<AppFolioTaxRate> = {}): AppFolioTaxRate {
  return {
    id: '1',
    name: 'Sales Tax 8.25%',
    rate: 8.25,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Sales Tax 8.25%')
    expect(result.rate).toBe(8.25)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps is_active false to isActive false', () => {
    const result = transformTaxRate(makeTaxRate({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when is_active is undefined', () => {
    const raw = makeTaxRate()
    // @ts-expect-error testing undefined
    delete raw.is_active
    const result = transformTaxRate(raw)
    expect(result.isActive).toBe(true)
  })

  it('converts numeric id to string', () => {
    const result = transformTaxRate(makeTaxRate({ id: 3 }))
    expect(result.id).toBe('3')
  })

  it('maps zero rate correctly', () => {
    const result = transformTaxRate(makeTaxRate({ name: 'Exempt', rate: 0 }))
    expect(result.rate).toBe(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
