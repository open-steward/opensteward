import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawZnodeOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/znode/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawZnodeOrder> = {}): RawZnodeOrder {
  return {
    OrderId: 1001,
    OrderNumber: 'ORD-2024-1001',
    PurchaseOrderNumber: 'PO-ACME-7890',
    CurrencyCode: 'EUR',
    SubTotal: 5000,
    Total: 5950,
    TaxCost: 950,
    DiscountAmount: 0,
    ShippingCost: 0,
    OrderStateId: 2, // Processing
    CreatedDate: '2024-07-01T10:00:00.000Z',
    ModifiedDate: '2024-07-02T08:00:00.000Z',
    CustomerNotes: 'Deliver to loading dock B',
    AccountId: 100,
    UserId: 1,
    Email: 'orders@acme-industrial.de',
    BillingAddress: {
      Address1: 'Berliner Str 10',
      CityName: 'Berlin',
      StateName: 'Berlin',
      PostalCode: '10115',
      CountryName: 'DE',
    },
    ShippingAddress: {
      Address1: 'Industriepark 5',
      CityName: 'Frankfurt',
      PostalCode: '60311',
      CountryName: 'DE',
    },
    OrderLineItems: [
      {
        OrderLineItemId: 1,
        SKU: 'PUMP-3000-STEEL-SM',
        ProductName: 'Industrial Pump 3000 - Steel / Small',
        ProductId: 43,
        Quantity: 2,
        Price: 1299.99,
        CurrencyCode: 'EUR',
      },
      {
        OrderLineItemId: 2,
        SKU: 'BOLT-7',
        ProductName: 'M8 Hex Bolt',
        ProductId: 99,
        Quantity: 500,
        Price: 0.50,
        CurrencyCode: 'EUR',
      },
    ],
    ...overrides,
  }
}

describe('transformOrder (Znode)', () => {
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
    const result = transformOrder(makeOrder({ OrderStateId: 5 }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBe('2024-07-02T08:00:00.000Z')
  })

  it('maps delivered status correctly', () => {
    const result = transformOrder(makeOrder({ OrderStateId: 4 }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps returned status correctly', () => {
    const result = transformOrder(makeOrder({ OrderStateId: 6 }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps pending status correctly', () => {
    const result = transformOrder(makeOrder({ OrderStateId: 1 }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps on-hold status correctly', () => {
    const result = transformOrder(makeOrder({ OrderStateId: 7 }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('includes B2B-specific fields in metadata', () => {
    const result = transformOrder(makeOrder())
    const meta = result.metadata as Record<string, unknown>
    expect(meta['userId']).toBe('1')
    expect(meta['purchaseOrderNumber']).toBe('PO-ACME-7890')
    expect(meta['accountId']).toBe('100')
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
      metadata: { purchaseOrderNumber: 'PO-NEW' },
    }) as Record<string, unknown>
    expect(body['CustomerNotes']).toBe('Updated delivery note')
  })
})
