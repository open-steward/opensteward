import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type NetvisorTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/taxrate'

function makeTaxRate(overrides: Partial<NetvisorTaxRate> = {}): NetvisorTaxRate {
  return {
    NetvisorKey: 66001,
    Name: 'ALV 24%',
    Percentage: 24,
    IsActive: 1,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps NetvisorKey to id as string', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('66001')
  })

  it('maps Name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('ALV 24%')
  })

  it('divides Percentage by 100 to get rate', () => {
    expect(transformTaxRate(makeTaxRate({ Percentage: 24 })).rate).toBe(0.24)
  })

  it('handles zero Percentage', () => {
    expect(transformTaxRate(makeTaxRate({ Percentage: 0 })).rate).toBe(0)
  })

  it('maps IsActive=1 to isActive=true', () => {
    expect(transformTaxRate(makeTaxRate({ IsActive: 1 })).isActive).toBe(true)
  })

  it('maps IsActive=0 to isActive=false', () => {
    expect(transformTaxRate(makeTaxRate({ IsActive: 0 })).isActive).toBe(false)
  })

  it('returns undefined name when Name is empty', () => {
    expect(transformTaxRate(makeTaxRate({ Name: '' })).name).toBeUndefined()
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
