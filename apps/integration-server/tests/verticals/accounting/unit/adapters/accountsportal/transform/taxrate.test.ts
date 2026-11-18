import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type APTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/accountsportal/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeAPTaxRate(overrides: Partial<APTaxRate> = {}): APTaxRate {
  return {
    id: 5,
    name: 'Standard Rate',
    description: 'UK standard VAT 20%',
    rate: 20,
    is_active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTaxRate (accountsportal)', () => {
  it('maps id as string', () => {
    expect(transformTaxRate(makeAPTaxRate({ id: 5 })).id).toBe('5')
  })

  it('maps name and description', () => {
    const result = transformTaxRate(makeAPTaxRate())
    expect(result.name).toBe('Standard Rate')
    expect(result.description).toBe('UK standard VAT 20%')
  })

  it('maps rate as percentage (not converted to minor units)', () => {
    expect(transformTaxRate(makeAPTaxRate({ rate: 20 })).rate).toBe(20)
  })

  it('maps is_active', () => {
    expect(transformTaxRate(makeAPTaxRate({ is_active: true })).isActive).toBe(true)
    expect(transformTaxRate(makeAPTaxRate({ is_active: false })).isActive).toBe(false)
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformTaxRate(makeAPTaxRate())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('leaves description undefined when null', () => {
    const result = transformTaxRate(makeAPTaxRate({ description: null }))
    expect(result.description).toBeUndefined()
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeAPTaxRate()))).not.toThrow()
  })
})
