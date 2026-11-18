import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type BCTaxGroup } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/taxrate'

function makeTaxGroup(overrides: Partial<BCTaxGroup> = {}): BCTaxGroup {
  return {
    id: 'tax-1',
    code: 'STANDARD',
    displayName: 'Standard Rate',
    ...overrides,
  }
}

describe('transformTaxRate (dynamics365bc)', () => {
  it('maps id and name', () => {
    const result = transformTaxRate(makeTaxGroup())
    expect(result.id).toBe('tax-1')
    expect(result.name).toBe('Standard Rate')
  })

  it('maps description from displayName', () => {
    expect(transformTaxRate(makeTaxGroup()).description).toBe('Standard Rate')
  })

  it('sets isActive true by default', () => {
    expect(transformTaxRate(makeTaxGroup()).isActive).toBe(true)
  })

  it('falls back to code for name when displayName is empty', () => {
    const result = transformTaxRate(makeTaxGroup({ displayName: '', code: 'STD' }))
    expect(result.name).toBe('STD')
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxGroup()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxGroup())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
