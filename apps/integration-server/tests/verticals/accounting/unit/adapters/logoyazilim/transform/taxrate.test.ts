import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type LogoTaxRate } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/taxrate'

function makeTaxRate(overrides: Partial<LogoTaxRate> = {}): LogoTaxRate {
  return {
    id: '10',
    Name: 'KDV %18',
    Rate: 18,
    IsActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('10')
  })

  it('maps name correctly', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('KDV %18')
  })

  it('maps rate correctly', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(18)
  })

  it('maps isActive when true', () => {
    expect(transformTaxRate(makeTaxRate({ IsActive: true })).isActive).toBe(true)
  })

  it('maps isActive when false', () => {
    expect(transformTaxRate(makeTaxRate({ IsActive: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when undefined', () => {
    const raw = makeTaxRate()
    delete raw.IsActive
    expect(transformTaxRate(raw).isActive).toBe(true)
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: LogoTaxRate = { id: '999' }
    const t = transformTaxRate(raw)
    expect(t.id).toBe('999')
    expect(t.name).toBeUndefined()
    expect(t.rate).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
