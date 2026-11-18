import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type ProcountorTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/taxrate'

function makeTaxRate(overrides: Partial<ProcountorTaxRate> = {}): ProcountorTaxRate {
  return {
    id: 1,
    name: 'ALV 24%',
    description: 'Standard VAT rate',
    percentage: 24,
    active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id as string', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('ALV 24%')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('Standard VAT rate')
  })

  it('divides percentage by 100 for rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 24 })).rate).toBe(0.24)
  })

  it('handles zero percentage', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 0 })).rate).toBe(0)
  })

  it('handles 10% rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 10 })).rate).toBe(0.1)
  })

  it('maps active=true to isActive=true', () => {
    expect(transformTaxRate(makeTaxRate({ active: true })).isActive).toBe(true)
  })

  it('maps active=false to isActive=false', () => {
    expect(transformTaxRate(makeTaxRate({ active: false })).isActive).toBe(false)
  })

  it('returns undefined name when empty', () => {
    expect(transformTaxRate(makeTaxRate({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined description when empty', () => {
    expect(transformTaxRate(makeTaxRate({ description: '' })).description).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
