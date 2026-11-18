import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type MyobTaxCode } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/taxrate'

function makeTax(overrides: Partial<MyobTaxCode> = {}): MyobTaxCode {
  return { UID: 'uid-7', Code: 'GST', Description: 'Goods and Services Tax', Rate: 10, IsActive: true, ...overrides }
}

describe('transformTaxRate (myob)', () => {
  it('maps id and name from Code', () => {
    expect(transformTaxRate(makeTax()).id).toBe('uid-7')
    expect(transformTaxRate(makeTax()).name).toBe('GST')
  })
  it('maps rate', () => { expect(transformTaxRate(makeTax()).rate).toBe(10) })
  it('IsActive true → isActive true', () => { expect(transformTaxRate(makeTax()).isActive).toBe(true) })
  it('passes raw as metadata', () => {
    const raw = makeTax()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTax())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
