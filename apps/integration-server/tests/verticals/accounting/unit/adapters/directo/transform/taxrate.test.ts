import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type DirectoVatCode,
} from '../../../../../../../src/verticals/accounting/adapters/directo/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<DirectoVatCode> = {}): DirectoVatCode {
  return {
    code: '20',
    name: 'Standard VAT 20%',
    rate: 20,
    closed: false,
    ...overrides,
  }
}

describe('directo transformTaxRate', () => {
  it('maps code to id', () => {
    const result = transformTaxRate(makeRaw({ code: 'VAT9' }))
    expect(result.id).toBe('VAT9')
  })

  it('maps name to both name and description', () => {
    const result = transformTaxRate(makeRaw({ name: 'Reduced VAT 9%' }))
    expect(result.name).toBe('Reduced VAT 9%')
    expect(result.description).toBe('Reduced VAT 9%')
  })

  it('maps rate', () => {
    const result = transformTaxRate(makeRaw({ rate: 9 }))
    expect(result.rate).toBe(9)
  })

  it('closed=false → isActive=true', () => {
    const result = transformTaxRate(makeRaw({ closed: false }))
    expect(result.isActive).toBe(true)
  })

  it('closed=true → isActive=false', () => {
    const result = transformTaxRate(makeRaw({ closed: true }))
    expect(result.isActive).toBe(false)
  })

  it('closed=undefined → isActive=undefined', () => {
    const result = transformTaxRate(makeRaw({ closed: undefined }))
    expect(result.isActive).toBeUndefined()
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
