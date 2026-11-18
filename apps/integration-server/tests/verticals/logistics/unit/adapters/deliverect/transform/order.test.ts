import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type DeliverectOrder,
} from '../../../../../../../src/verticals/logistics/adapters/deliverect/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(o: Partial<DeliverectOrder> = {}): DeliverectOrder {
  return {
    _id: 'delv-order-001',
    channelOrderId: 'CH-ORD-001',
    channelOrderDisplayId: 'DISPLAY-001',
    status: 2,
    accountId: 'acc-abc',
    channelLinkId: 'link-xyz',
    pickupAddress: {
      address1: '100 Restaurant Row',
      city: 'Chicago',
      state: 'IL',
      postalCode: '60601',
      country: 'US',
    },
    deliveryAddress: {
      name: 'Customer Name',
      address1: '200 Customer Lane',
      city: 'Chicago',
      state: 'IL',
      postalCode: '60602',
      country: 'US',
    },
    items: [
      {
        _id: 'item-1',
        plu: 'SKU-BURGER',
        name: 'Cheeseburger',
        quantity: 2,
        price: 999,
        totalPrice: 1998,
      },
    ],
    price: 2498,
    subTotalPrice: 1998,
    deliveryFee: 300,
    taxAmount: 200,
    currency: 'USD',
    note: 'Extra ketchup please',
    orderAt: '2024-03-01T00:00:00Z',
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T01:00:00Z',
    ...o,
  }
}

describe('deliverect transformOrder', () => {
  it('maps _id to id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('delv-order-001')
  })

  it('uses channelOrderId as id when _id is null', () => {
    const result = transformOrder(makeOrder({ _id: null }))
    expect(result.id).toBe('CH-ORD-001')
  })

  it('maps status 2 to PROCESSING', () => {
    const result = transformOrder(makeOrder({ status: 2 }))
    expect(result.status).toBe('PROCESSING')
  })

  it('maps status 1 to PENDING', () => {
    const result = transformOrder(makeOrder({ status: 1 }))
    expect(result.status).toBe('PENDING')
  })

  it('maps status 4 to AWAITING_SHIPMENT', () => {
    const result = transformOrder(makeOrder({ status: 4 }))
    expect(result.status).toBe('AWAITING_SHIPMENT')
  })

  it('maps status 5 to SHIPPED', () => {
    const result = transformOrder(makeOrder({ status: 5 }))
    expect(result.status).toBe('SHIPPED')
  })

  it('maps status 6 to DELIVERED', () => {
    const result = transformOrder(makeOrder({ status: 6 }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps status 101 to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 101 }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status 110 to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 110 }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps string status to numeric code', () => {
    const result = transformOrder(makeOrder({ status: '2' }))
    expect(result.status).toBe('PROCESSING')
  })

  it('maps channelOrderDisplayId to orderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('DISPLAY-001')
  })

  it('maps accountId to customerId', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('acc-abc')
  })

  it('maps channelLinkId to warehouseId', () => {
    const result = transformOrder(makeOrder())
    expect(result.warehouseId).toBe('link-xyz')
  })

  it('maps items to lineItems', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-BURGER')
    expect(result.lineItems![0].name).toBe('Cheeseburger')
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(999)
    expect(result.lineItems![0].totalAmount).toBe(1998)
  })

  it('maps price to totalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(2498)
  })

  it('maps subTotalPrice to subtotalAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalAmount).toBe(1998)
  })

  it('maps deliveryFee to shippingAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAmount).toBe(300)
  })

  it('maps taxAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.taxAmount).toBe(200)
  })

  it('maps currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('USD')
  })

  it('maps note to notes', () => {
    const result = transformOrder(makeOrder())
    expect(result.notes).toBe('Extra ketchup please')
  })

  it('maps deliveryAddress city', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.city).toBe('Chicago')
  })

  it('maps pickupAddress city', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.city).toBe('Chicago')
  })

  it('maps orderAt date', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderAt).toBeInstanceOf(Date)
  })

  it('maps created to createdAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('emits unknown status for unrecognised status codes', () => {
    const result = transformOrder({ status: 999 })
    expect(result.status).toBe('unknown')
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
