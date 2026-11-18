import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type NetSuiteTaxCode } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/taxrate'

function makeTax(overrides: Partial<NetSuiteTaxCode> = {}): NetSuiteTaxCode {
  return { id: 600, itemId: 'CA_STATE_TAX', rate: 7.25, isInactive: false, ...overrides }
}

describe('transformTaxRate (netsuite)', () => {
  it('maps id and name', () => {
    expect(transformTaxRate(makeTax()).id).toBe('600')
    expect(transformTaxRate(makeTax()).name).toBe('CA_STATE_TAX')
  })
  it('maps rate', () => { expect(transformTaxRate(makeTax()).rate).toBe(7.25) })
  it('isInactive false → isActive true', () => { expect(transformTaxRate(makeTax()).isActive).toBe(true) })
  it('passes raw as metadata', () => {
    const raw = makeTax()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTax())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
