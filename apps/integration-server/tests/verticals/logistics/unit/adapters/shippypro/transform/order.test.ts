import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  transformOrderDetail,
  type ShippyProOrder,
} from '../../../../../../../src/verticals/logistics/adapters/shippypro/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<ShippyProOrder> = {}): ShippyProOrder {
  return {
    OrderId: 'ord-100',
    TransactionId: 'txn-200',
    Reference: 'REF-2024-001',
    Status: 'shipped',
    CarrierName: 'UPS',
    TrackingNumber: 'UPS9876543210',
    FromAddress: {
      Name: 'Sender A',
      Street1: '1 Ship St',
      City: 'Chicago',
      State: 'IL',
      Zip: '60601',
      Country: 'US',
    },
    ToAddress: {
      Name: 'Receiver B',
      Street1: '2 Deliver Ave',
      City: 'Houston',
      State: 'TX',
      Zip: '77001',
      Country: 'US',
    },
    ShipDate: '2024-03-01T00:00:00Z',
    DeliveryDate: '2024-03-04T00:00:00Z',
    CreatedAt: '2024-03-01T00:00:00Z',
    UpdatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (shippypro)', () => {
  it('maps id from OrderId (preferred over TransactionId)', () => {
    expect(transformOrder(makeOrder()).id).toBe('ord-100')
  })

  it('maps orderNumber from Reference', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('REF-2024-001')
  })

  it('maps shipmentIds as array of TransactionId', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['txn-200'])
  })

  it('maps origin and destination addresses via transformAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.city).toBe('Chicago')
    expect(result.destinationAddress?.city).toBe('Houston')
  })

  it('maps shippedAt from ShipDate and deliveredAt from DeliveryDate', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippedAt).toBeInstanceOf(Date)
    expect(result.deliveredAt).toBeInstanceOf(Date)
  })

  it('maps all order statuses correctly', () => {
    const cases: [string | null | undefined, string][] = [
      ['pending', 'PENDING'],
      ['processing', 'PROCESSING'],
      ['on_hold', 'ON_HOLD'],
      ['awaiting_shipment', 'AWAITING_SHIPMENT'],
      ['label_created', 'AWAITING_SHIPMENT'],
      ['shipped', 'SHIPPED'],
      ['in_transit', 'SHIPPED'],
      ['delivered', 'DELIVERED'],
      ['cancelled', 'CANCELLED'],
      ['returned', 'RETURNED'],
      ['return_to_sender', 'RETURNED'],
      ['something_else', 'PENDING'],
      [null, 'PENDING'],
    ]
    for (const [status, expected] of cases) {
      expect(transformOrder(makeOrder({ Status: status ?? undefined })).status).toBe(expected)
    }
  })

  it('shipmentIds is undefined when TransactionId is absent', () => {
    const result = transformOrder(makeOrder({ TransactionId: null }))
    expect(result.shipmentIds).toBeUndefined()
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('sets metadata to raw input', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})

// Fixture: the documented example of GetOrderResponse (https://api.shippypro.com/docs/v1.json).
describe('transformOrderDetail (shippypro GetOrder)', () => {
  const DOC = {
    Result: 'OK',
    OrderID: '612648',
    TransactionID: '1234',
    CarrierID: '3',
    TrackingCarrier: 'DHL',
    TrackingNumber: '8599848451',
    MarketplacePlatform: 'Amazon',
    Status: '1',
    LabelURL: ['https://cdn.shippypro.com/labels/label.pdf'],
  }

  it('maps OrderID, TransactionID and the shared shipment id, and parses with OrderSchema', () => {
    const o = OrderSchema.parse(transformOrderDetail(DOC))
    expect(o.id).toBe('612648')
    expect(o.orderNumber).toBe('1234')
    expect(o.shipmentIds).toEqual(['612648'])
  })

  it('does not turn the tracking Status into an order status', () => {
    expect(transformOrderDetail(DOC).status).toBeUndefined()
  })
})
