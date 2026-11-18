import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type SageTaxRate } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/taxrate'

function makeRaw(overrides: Partial<SageTaxRate> = {}): SageTaxRate {
  return {
    id: 'tax-001',
    name: 'Standard 20%',
    percentage: 20,
    is_visible: true,
    ...overrides,
  }
}

describe('transformTaxRate (SageBusinessCloud)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('tax-001')
    expect(result.name).toBe('Standard 20%')
    expect(result.rate).toBe(20)
    expect(result.isActive).toBe(true)
  })

  it('marks hidden tax rate as inactive', () => {
    expect(transformTaxRate(makeRaw({ is_visible: false })).isActive).toBe(false)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
