import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type ClearBooksTaxRate } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/taxrate'

function makeTaxRate(overrides: Partial<ClearBooksTaxRate> = {}): ClearBooksTaxRate {
  return {
    tax_code_id: '1',
    name: 'Standard Rate (20%)',
    rate: 20,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Standard Rate (20%)')
    expect(result.rate).toBe(20)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps reduced rate (5%) correctly', () => {
    const result = transformTaxRate(makeTaxRate({ name: 'Reduced Rate (5%)', rate: 5 }))
    expect(result.rate).toBe(5)
  })

  it('maps zero rate (0%) correctly', () => {
    const result = transformTaxRate(makeTaxRate({ name: 'Zero Rate', rate: 0 }))
    expect(result.rate).toBe(0)
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

  it('converts numeric tax_code_id to string', () => {
    const result = transformTaxRate(makeTaxRate({ tax_code_id: 3 }))
    expect(result.id).toBe('3')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
