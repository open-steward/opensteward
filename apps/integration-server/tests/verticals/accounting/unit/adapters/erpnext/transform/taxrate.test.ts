import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type ErpNextTaxRate } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/taxrate'

function makeRaw(overrides: Partial<ErpNextTaxRate> = {}): ErpNextTaxRate {
  return {
    name: 'GST 18%',
    title: 'GST 18%',
    tax_rate: 18,
    disabled: 0,
    ...overrides,
  }
}

describe('transformTaxRate (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('GST 18%')
    expect(result.name).toBe('GST 18%')
    expect(result.rate).toBe(18)
    expect(result.isActive).toBe(true)
  })

  it('resolves rate from taxes array if no direct tax_rate', () => {
    const result = transformTaxRate(makeRaw({ tax_rate: undefined, taxes: [{ tax_rate: 10 }] }))
    expect(result.rate).toBe(10)
  })

  it('marks disabled tax rate as inactive', () => {
    expect(transformTaxRate(makeRaw({ disabled: 1 })).isActive).toBe(false)
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
