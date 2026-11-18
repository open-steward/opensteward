import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapOrderStatus,
  type DaVinciOrder,
} from '../../../../../../../src/verticals/logistics/adapters/da-vinci-unified/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(o: Partial<DaVinciOrder> = {}): DaVinciOrder {
  return {
    OrderId: 1001,
    OrderKey: 'KEY-1001',
    OrderNumber: 'ORD-2024-001',
    Status: 'Shipped',
    CustomerId: 500,
    CustomerCode: 'CUST-A',
    WarehouseId: 10,
    ShipToAddress: {
      name: 'Jane Doe',
      address1: '200 Oak Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    },
    Items: [
      {
        ItemId: 99,
        SKU: 'SKU-001',
        Description: 'Widget',
        Quantity: 2,
        UnitPrice: 1000,
        TotalPrice: 2000,
      },
    ],
    ShipmentIds: [301, 302],
    Currency: 'USD',
    SubTotal: 2000,
    TaxAmount: 160,
    ShippingAmount: 500,
    TotalAmount: 2660,
    OrderDate: '2024-03-01T00:00:00Z',
    ShippedDate: '2024-03-02T00:00:00Z',
    CreatedDate: '2024-03-01T00:00:00Z',
    ModifiedDate: '2024-03-02T00:00:00Z',
    ...o,
  }
}

describe('da-vinci-unified mapOrderStatus', () => {
  it('maps New to PENDING', () => expect(mapOrderStatus('New')).toBe('PENDING'))
  it('maps Processing to PROCESSING', () => expect(mapOrderStatus('Processing')).toBe('PROCESSING'))
  it('maps OnHold to ON_HOLD', () => expect(mapOrderStatus('OnHold')).toBe('ON_HOLD'))
  it('maps ReadyToShip to AWAITING_SHIPMENT', () =>
    expect(mapOrderStatus('ReadyToShip')).toBe('AWAITING_SHIPMENT'))
  it('maps Shipped to SHIPPED', () => expect(mapOrderStatus('Shipped')).toBe('SHIPPED'))
  it('maps Delivered to DELIVERED', () => expect(mapOrderStatus('Delivered')).toBe('DELIVERED'))
  it('maps Cancelled to CANCELLED', () => expect(mapOrderStatus('Cancelled')).toBe('CANCELLED'))
  it('maps Returned to RETURNED', () => expect(mapOrderStatus('Returned')).toBe('RETURNED'))
  it('defaults unknown to PENDING', () =>
    expect(mapOrderStatus('SomeRandomStatus')).toBe('PENDING'))
})

describe('da-vinci-unified transformOrder', () => {
  it('maps OrderId to string id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
  })

  it('uses OrderKey as id when OrderId is null', () => {
    const result = transformOrder(makeOrder({ OrderId: null }))
    expect(result.id).toBe('KEY-1001')
  })

  it('maps Status to canonical OrderStatus', () => {
    const result = transformOrder(makeOrder())
    expect(result.status).toBe('SHIPPED')
  })

  it('maps OrderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('ORD-2024-001')
  })

  it('maps CustomerId to string', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('500')
  })

  it('maps WarehouseId to string', () => {
    const result = transformOrder(makeOrder())
    expect(result.warehouseId).toBe('10')
  })

  it('maps ShipmentIds to string array', () => {
    const result = transformOrder(makeOrder())
    expect(result.shipmentIds).toEqual(['301', '302'])
  })

  it('maps Items to lineItems', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-001')
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(1000)
  })

  it('maps Currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('USD')
  })

  it('maps financial totals', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalAmount).toBe(2000)
    expect(result.taxAmount).toBe(160)
    expect(result.shippingAmount).toBe(500)
    expect(result.totalAmount).toBe(2660)
  })

  it('maps OrderDate to orderAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderAt).toBeInstanceOf(Date)
  })

  it('maps ShippedDate to shippedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippedAt).toBeInstanceOf(Date)
  })

  it('maps ShipToAddress to destinationAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.city).toBe('Austin')
    expect(result.destinationAddress?.state).toBe('TX')
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('passes OrderSchema validation with minimal input', () => {
    const result = transformOrder({})
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
