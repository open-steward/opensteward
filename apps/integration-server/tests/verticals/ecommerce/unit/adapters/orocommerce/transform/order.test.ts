import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawOroOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/orocommerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawOroOrder> = {}): RawOroOrder {
  return {
    id: '1001',
    identifier: 'ORD-2024-1001',
    poNumber: 'PO-ACME-7890',
    currency: 'EUR',
    subtotalValue: 5000,
    totalValue: 5950,
    totalTax: 950,
    totalDiscounts: 0,
    shippingCostAmount: 0,
    internalStatus: 'processing',
    createdAt: '2024-07-01T10:00:00.000Z',
    updatedAt: '2024-07-02T08:00:00.000Z',
    customerNotes: 'Deliver to loading dock B',
    customer: { id: '100' },
    customerUser: { id: 'user-1' },
    shoppingList: { id: 'sl-42' },
    email: 'orders@acme-industrial.de',
    billingAddress: {
      street: 'Berliner Str 10',
      city: 'Berlin',
      region: 'Berlin',
      postalCode: '10115',
      country: 'DE',
    },
    shippingAddress: {
      street: 'Industriepark 5',
      city: 'Frankfurt',
      postalCode: '60311',
      country: 'DE',
    },
    lineItems: [
      {
        id: 'li-1',
        productSku: 'PUMP-3000-STEEL-SM',
        productName: 'Industrial Pump 3000 - Steel / Small',
        productId: '43',
        quantity: 2,
        price: 1299.99,
        currency: 'EUR',
      },
      {
        id: 'li-2',
        productSku: 'BOLT-7',
        productName: 'M8 Hex Bolt',
        productId: '99',
        quantity: 500,
        price: 0.50,
        currency: 'EUR',
      },
    ],
    _type: 'orders',
    ...overrides,
  }
}

describe('transformOrder (OroCommerce)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(result.orderNumber).toBe('ORD-2024-1001')
    expect(result.name).toBe('#ORD-2024-1001')
    expect(result.customerId).toBe('100')
    expect(result.currency).toBe('EUR')
    expect(result.totalPrice).toEqual({ amount: 595000, currency: 'EUR' })
  })

  it('maps processing status correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps cancelled status correctly', () => {
    const result = transformOrder(makeOrder({ internalStatus: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBe('2024-07-02T08:00:00.000Z')
  })

  it('maps closed status correctly', () => {
    const result = transformOrder(makeOrder({ internalStatus: 'closed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('includes B2B-specific fields in metadata', () => {
    const result = transformOrder(makeOrder())
    const meta = result.metadata as Record<string, unknown>
    expect(meta['ownerCustomerUserId']).toBe('user-1')
    expect(meta['poNumber']).toBe('PO-ACME-7890')
    expect(meta['shoppingListId']).toBe('sl-42')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!.sku).toBe('PUMP-3000-STEEL-SM')
    expect(result.lineItems![0]!.quantity).toBe(2)
    expect(result.lineItems![0]!.price).toEqual({ amount: 129999, currency: 'EUR' })
    expect(result.lineItems![1]!.quantity).toBe(500)
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.city).toBe('Berlin')
    expect(result.shippingAddress?.city).toBe('Frankfurt')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const body = untransformOrder({
      note: 'Updated delivery note',
      metadata: { poNumber: 'PO-NEW' },
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('orders')
    expect(body.data.attributes['customerNotes']).toBe('Updated delivery note')
  })
})
