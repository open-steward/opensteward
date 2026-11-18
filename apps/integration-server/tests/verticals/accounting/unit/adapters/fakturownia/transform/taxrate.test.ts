import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type FakturowniaCategory,
} from '../../../../../../../src/verticals/accounting/adapters/fakturownia/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<FakturowniaCategory> = {}): FakturowniaCategory {
  return {
    id: 10,
    name: 'VAT 23%',
    description: 'Polish standard VAT rate',
    use_with_documents: true,
    ...overrides,
  }
}

describe('fakturownia transformTaxRate', () => {
  it('maps id to string', () => {
    const result = transformTaxRate(makeRaw({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps name', () => {
    const result = transformTaxRate(makeRaw({ name: 'VAT 8%' }))
    expect(result.name).toBe('VAT 8%')
  })

  it('maps description', () => {
    const result = transformTaxRate(makeRaw({ description: 'Reduced rate' }))
    expect(result.description).toBe('Reduced rate')
  })

  it('use_with_documents=true → isActive=true', () => {
    const result = transformTaxRate(makeRaw({ use_with_documents: true }))
    expect(result.isActive).toBe(true)
  })

  it('use_with_documents=false → isActive=false', () => {
    const result = transformTaxRate(makeRaw({ use_with_documents: false }))
    expect(result.isActive).toBe(false)
  })

  it('use_with_documents=undefined → isActive=true (default)', () => {
    const result = transformTaxRate(makeRaw({ use_with_documents: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('no rate field emitted (categories carry no numeric rate)', () => {
    // Fakturownia categories don't carry a numeric rate — rate should be undefined
    const result = transformTaxRate(makeRaw())
    expect(result.rate).toBeUndefined()
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
