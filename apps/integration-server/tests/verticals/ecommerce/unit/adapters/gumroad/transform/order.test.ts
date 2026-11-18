import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  centsToMoney,
  type RawGumroadSale,
} from '../../../../../../../src/verticals/ecommerce/adapters/gumroad/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeSale(overrides: Partial<RawGumroadSale> = {}): RawGumroadSale {
  return {
    id: 'sale-xyz-789',
    email: 'buyer@example.com',
    seller_id: 'seller-001',
    order_number: 42,
    product_id: 'abc123',
    product_name: 'Ultimate Guide to TypeScript',
    quantity: 1,
    price: 1999, // $19.99
    currency_code: 'USD',
    refunded: false,
    partially_refunded: false,
    chargebacked: false,
    created_at: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Gumroad)', () => {
  it('maps core fields and uses sale id as canonical id', () => {
    const result = transformOrder(makeSale())
    expect(result.id).toBe('sale-xyz-789')
    expect(result.orderNumber).toBe('42')
    expect(result.email).toBe('buyer@example.com')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('creates a single line item from the sale', () => {
    const result = transformOrder(makeSale())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('sale-xyz-789')
    expect(li.productId).toBe('abc123')
    expect(li.title).toBe('Ultimate Guide to TypeScript')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps financial status for a normal paid sale', () => {
    const result = transformOrder(makeSale())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps financial status for a refunded sale', () => {
    const result = transformOrder(makeSale({ refunded: true }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps financial status for a partially refunded sale', () => {
    const result = transformOrder(makeSale({ partially_refunded: true }))
    expect(result.financialStatus).toBe('PARTIALLY_REFUNDED')
  })

  it('maps financial status for a chargebacked sale', () => {
    const result = transformOrder(makeSale({ chargebacked: true }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('maps fulfillment status to FULFILLED for all digital sales', () => {
    const result = transformOrder(makeSale())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps timestamps', () => {
    const result = transformOrder(makeSale())
    expect(result.createdAt).toBe('2024-05-01T12:00:00Z')
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeSale()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const minimal = makeSale({
      email: undefined,
      order_number: undefined,
      product_id: undefined,
      product_name: undefined,
      quantity: undefined,
    })
    const result = transformOrder(minimal)
    expect(result.email).toBeUndefined()
    expect(result.orderNumber).toBeUndefined()
    expect(result.lineItems![0]!.title).toBe('sale-xyz-789')
    expect(result.lineItems![0]!.quantity).toBe(1)
  })
})

describe('mapFinancialStatus (Gumroad)', () => {
  it('maps all known states', () => {
    expect(mapFinancialStatus({ id: '1', price: 0, refunded: true } as RawGumroadSale)).toBe('REFUNDED')
    expect(mapFinancialStatus({ id: '1', price: 0, partially_refunded: true } as RawGumroadSale)).toBe('PARTIALLY_REFUNDED')
    expect(mapFinancialStatus({ id: '1', price: 0, chargebacked: true } as RawGumroadSale)).toBe('VOIDED')
    expect(mapFinancialStatus({ id: '1', price: 0 } as RawGumroadSale)).toBe('PAID')
  })
})

describe('mapFulfillmentStatus (Gumroad)', () => {
  it('always returns FULFILLED for digital products', () => {
    expect(mapFulfillmentStatus({ id: '1', price: 0 } as RawGumroadSale)).toBe('FULFILLED')
  })
})

describe('centsToMoney', () => {
  it('passes through integer minor units', () => {
    expect(centsToMoney(1999, 'USD')).toEqual({ amount: 1999, currency: 'USD' })
    expect(centsToMoney(500, 'EUR')).toEqual({ amount: 500, currency: 'EUR' })
    expect(centsToMoney(0, 'USD')).toEqual({ amount: 0, currency: 'USD' })
  })

  it('returns undefined for undefined input', () => {
    expect(centsToMoney(undefined, 'USD')).toBeUndefined()
  })
})
