import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type CashCtrlTax,
} from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTax(overrides: Partial<CashCtrlTax> = {}): CashCtrlTax {
  return {
    id: 1,
    name: 'MwSt 7.7%',
    percentage: 7.7,
    accountId: 2200,
    isInactive: false,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id to string', () => {
    expect(transformTaxRate(makeTax({ id: 42 })).id).toBe('42')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTax({ name: 'USt 19%' })).name).toBe('USt 19%')
  })

  it('maps name to description as well', () => {
    expect(transformTaxRate(makeTax({ name: 'USt 19%' })).description).toBe('USt 19%')
  })

  it('maps percentage to rate', () => {
    expect(transformTaxRate(makeTax({ percentage: 7.7 })).rate).toBe(7.7)
  })

  it('maps isInactive=false to isActive=true', () => {
    expect(transformTaxRate(makeTax({ isInactive: false })).isActive).toBe(true)
  })

  it('maps isInactive=true to isActive=false', () => {
    expect(transformTaxRate(makeTax({ isInactive: true })).isActive).toBe(false)
  })

  it('maps null isInactive to isActive=true', () => {
    expect(transformTaxRate(makeTax({ isInactive: null })).isActive).toBe(true)
  })

  it('maps null percentage to undefined rate', () => {
    expect(transformTaxRate(makeTax({ percentage: null })).rate).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTax()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeTax()))).not.toThrow()
  })
})
