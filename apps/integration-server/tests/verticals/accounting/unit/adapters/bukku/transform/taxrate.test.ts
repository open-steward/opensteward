import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type BukkuTaxRate } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/taxrate'

function makeRaw(overrides: Partial<BukkuTaxRate> = {}): BukkuTaxRate {
  return {
    id: '1',
    name: 'SST 6%',
    rate: 6,
    type: 'sales',
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('1')
    expect(result.name).toBe('SST 6%')
    expect(result.rate).toBe(6)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ name: 'Custom Tax' })
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['name']).toBe('Custom Tax')
  })

  it('maps active flag false to isActive false', () => {
    const result = transformTaxRate(makeRaw({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('maps different tax types correctly', () => {
    const salesResult = transformTaxRate(makeRaw({ type: 'sales' }))
    expect(salesResult.id).toBe('1')

    const purchaseResult = transformTaxRate(makeRaw({ type: 'purchase' }))
    expect(purchaseResult.id).toBe('1')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
