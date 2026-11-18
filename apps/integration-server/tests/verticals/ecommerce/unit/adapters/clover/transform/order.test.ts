import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawCloverOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/clover/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawCloverOrder> = {}): RawCloverOrder {
  return {
    id: 'ORD_001',
    title: 'Order #1001',
    note: 'Extra hot',
    state: 'paid',
    total: 1500,
    currency: 'USD',
    lineItems: {
      elements: [
        {
          id: 'LI_001',
          item: { id: 'ITEM_001' },
          name: 'Latte',
          price: 450,
          unitQty: 2,
        },
      ],
    },
    payments: { elements: [{ id: 'PAY_001', amount: 1500 }] },
    refunds: { elements: [{ id: 'REF_001' }] },
    customers: { elements: [{ id: 'CUST_001' }] },
    createdTime: 1714557600000,
    modifiedTime: 1714564800000,
    clientCreatedTime: 1714557600000,
    ...overrides,
  }
}

describe('transformOrder (Clover)', () => {
  it('maps core fields with money conversion', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ORD_001')
    expect(result.orderNumber).toBe('Order #1001')
    expect(result.customerId).toBe('CUST_001')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 1500, currency: 'USD' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('LI_001')
    expect(li.productId).toBe('ITEM_001')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 450, currency: 'USD' })
  })

  it('maps financial status', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps open state to PENDING', () => {
    const result = transformOrder(makeOrder({ state: 'open' }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps payment and refund ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.transactionIds).toEqual(['PAY_001'])
    expect(result.refundIds).toEqual(['REF_001'])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('handles missing line items', () => {
    const result = transformOrder(makeOrder({ lineItems: undefined }))
    expect(result.lineItems).toBeUndefined()
  })
})

describe('untransformOrder (Clover)', () => {
  it('wraps line items for atomic order', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    const cart = raw['orderCart'] as Record<string, unknown>
    const items = cart['lineItems'] as Array<Record<string, unknown>>
    expect(items[0]!['name']).toBe('Latte')
    expect(items[0]!['unitQty']).toBe(2)
  })
})
