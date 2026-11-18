import { describe, it, expect } from 'vitest'
import {
  transformQuoteItem,
  type DelivereeQuoteItem,
} from '../../../../../../../src/verticals/logistics/adapters/deliveree/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeQuoteItem(overrides: Partial<DelivereeQuoteItem> = {}): DelivereeQuoteItem {
  return {
    vehicle_type_id: 42,
    vehicle_type_name: 'Van',
    total_fees: 1500,
    currency: 'THB',
    ...overrides,
  }
}

describe('deliveree transformQuoteItem', () => {
  it('sets carrierId to deliveree', () => {
    const result = transformQuoteItem(makeQuoteItem())
    expect(result.carrierId).toBe('deliveree')
  })

  it('maps vehicle_type_id to id and serviceCode as strings', () => {
    const result = transformQuoteItem(makeQuoteItem())
    expect(result.id).toBe('42')
    expect(result.serviceCode).toBe('42')
  })

  it('maps vehicle_type_name to serviceName', () => {
    const result = transformQuoteItem(makeQuoteItem())
    expect(result.serviceName).toBe('Van')
  })

  it('maps currency', () => {
    const result = transformQuoteItem(makeQuoteItem())
    expect(result.currency).toBe('THB')
  })

  it('maps total_fees to totalAmount', () => {
    const result = transformQuoteItem(makeQuoteItem())
    expect(result.totalAmount).toBe(1500)
  })

  it('passes schema validation', () => {
    const result = transformQuoteItem(makeQuoteItem())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('handles null vehicle_type_id', () => {
    const result = transformQuoteItem(makeQuoteItem({ vehicle_type_id: null }))
    expect(result.id).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
  })

  it('handles null total_fees', () => {
    const result = transformQuoteItem(makeQuoteItem({ total_fees: null }))
    expect(result.totalAmount).toBeUndefined()
  })
})
