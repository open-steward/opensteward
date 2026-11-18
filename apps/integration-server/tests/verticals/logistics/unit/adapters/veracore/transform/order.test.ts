import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type VeraCoreOrder,
} from '../../../../../../../src/verticals/logistics/adapters/veracore/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<VeraCoreOrder> = {}): VeraCoreOrder {
  return {
    OrderID: 'VCO-2024-001',
    OrderNumber: 'ORD-1001',
    Status: 'Processing',
    CustomerID: 'CUST-42',
    WarehouseID: 'WH-7',
    ShipToAddress: {
      name: 'Alice Smith',
      street1: '100 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    },
    ShipFromAddress: {
      name: 'VeraCore Warehouse',
      street1: '200 Fulfillment Blvd',
      city: 'Memphis',
      state: 'TN',
      postalCode: '38101',
      country: 'US',
    },
    Items: [{ ItemID: 10, SKU: 'SKU-A', Quantity: 3, Description: 'Widget A', UnitPrice: 999 }],
    ShipmentIDs: [55, 56],
    Notes: 'Handle with care',
    RequestedServiceCode: 'UPS_GROUND',
    ServiceCode: null,
    OrderDate: '2024-03-01T00:00:00Z',
    ShippedDate: null,
    DeliveredDate: null,
    CancelledDate: null,
    CreatedDate: '2024-03-01T00:00:00Z',
    ModifiedDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (veracore)', () => {
  it('maps id from OrderID as string', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('VCO-2024-001')
  })

  it('maps orderNumber from OrderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('ORD-1001')
  })

  it('maps status "Processing" to PROCESSING', () => {
    const result = transformOrder(makeOrder({ Status: 'Processing' }))
    expect(result.status).toBe('PROCESSING')
  })

  it('maps status "Shipped" to SHIPPED', () => {
    const result = transformOrder(makeOrder({ Status: 'Shipped' }))
    expect(result.status).toBe('SHIPPED')
  })

  it('maps status "Delivered" to DELIVERED', () => {
    const result = transformOrder(makeOrder({ Status: 'Delivered' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps status "Cancelled" to CANCELLED', () => {
    const result = transformOrder(makeOrder({ Status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status "On Hold" to ON_HOLD', () => {
    const result = transformOrder(makeOrder({ Status: 'On Hold' }))
    expect(result.status).toBe('ON_HOLD')
  })

  it('maps status "Awaiting Shipment" to AWAITING_SHIPMENT', () => {
    const result = transformOrder(makeOrder({ Status: 'Awaiting Shipment' }))
    expect(result.status).toBe('AWAITING_SHIPMENT')
  })

  it('maps customerId from CustomerID', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('CUST-42')
  })

  it('maps warehouseId from WarehouseID', () => {
    const result = transformOrder(makeOrder())
    expect(result.warehouseId).toBe('WH-7')
  })

  it('maps shipmentIds from ShipmentIDs', () => {
    const result = transformOrder(makeOrder())
    expect(result.shipmentIds).toEqual(['55', '56'])
  })

  it('maps lineItems from Items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-A')
    expect(result.lineItems![0].quantity).toBe(3)
  })

  it('maps notes from Notes', () => {
    const result = transformOrder(makeOrder())
    expect(result.notes).toBe('Handle with care')
  })

  it('maps requestedServiceCode from RequestedServiceCode', () => {
    const result = transformOrder(makeOrder())
    expect(result.requestedServiceCode).toBe('UPS_GROUND')
  })

  it('maps createdAt as a Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps destinationAddress from ShipToAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.name).toBe('Alice Smith')
    expect(result.destinationAddress?.city).toBe('Austin')
  })

  it('passes metadata through as raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
