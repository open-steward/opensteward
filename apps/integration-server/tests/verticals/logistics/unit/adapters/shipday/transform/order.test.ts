import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ShipdayOrder,
} from '../../../../../../../src/verticals/logistics/adapters/shipday/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<ShipdayOrder> = {}): ShipdayOrder {
  return {
    orderId: 1001,
    orderNumber: 'SD-ORD-001',
    status: 'DELIVERED',
    customerName: 'Jane Doe',
    customerAddress: '100 Main St, San Francisco, CA 94114',
    customerEmail: 'jane.doe@acme.example',
    customerPhoneNumber: '+14155550123',
    pickupName: 'Acme Warehouse',
    pickupPhoneNumber: '+14155550100',
    pickupAddress: {
      street: '1 Market St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US',
    },
    totalOrderCost: 49.99,
    orderTime: '2024-03-01T00:00:00Z',
    deliveryTime: '2024-03-01T10:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T10:30:00Z',
    ...overrides,
  }
}

describe('transformOrder (shipday)', () => {
  it('maps id from orderId (string-coerced)', () => {
    expect(transformOrder(makeOrder()).id).toBe('1001')
  })

  it('maps orderNumber from orderNumber field', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('SD-ORD-001')
  })

  it('maps status: DELIVERED → DELIVERED', () => {
    expect(transformOrder(makeOrder({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps totalAmount via Math.round(totalOrderCost * 100)', () => {
    // 49.99 * 100 = 4999 (integer minor units)
    expect(transformOrder(makeOrder({ totalOrderCost: 49.99 })).totalAmount).toBe(4999)
  })

  it('maps orderAt as Date from orderTime', () => {
    expect(transformOrder(makeOrder()).orderAt).toBeInstanceOf(Date)
  })

  it('maps deliveredAt as Date from deliveryTime', () => {
    expect(transformOrder(makeOrder()).deliveredAt).toBeInstanceOf(Date)
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps destinationAddress from flat customerAddress fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.street1).toBe('100 Main St, San Francisco, CA 94114')
    expect(result.destinationAddress?.phone).toBe('+14155550123')
  })

  it('maps originAddress from flat pickupAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.name).toBe('Acme Warehouse')
    expect(result.originAddress?.city).toBe('San Francisco')
    expect(result.originAddress?.country).toBe('US')
  })

  it('prefers nested customer.address over flat fields for destinationAddress', () => {
    const raw = makeOrder({
      customer: {
        name: 'Nested Customer',
        email: 'nested@acme.example',
        phone_number: '+14155559999',
        address: {
          street: '200 Nested St',
          city: 'Oakland',
          state: 'CA',
          zip: '94601',
          country: 'US',
        },
      },
    })
    const result = transformOrder(raw)
    expect(result.destinationAddress?.name).toBe('Nested Customer')
    expect(result.destinationAddress?.city).toBe('Oakland')
  })

  it('passes metadata as original raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('maps all order statuses correctly', () => {
    const cases: [string, string][] = [
      ['ASSIGNED', 'PROCESSING'],
      ['STARTED', 'PROCESSING'],
      ['ACCEPTED', 'PROCESSING'],
      ['PICKED_UP', 'SHIPPED'],
      ['IN_TRANSIT', 'SHIPPED'],
      ['OUT_FOR_DELIVERY', 'SHIPPED'],
      ['DELIVERED', 'DELIVERED'],
      ['CANCELLED', 'CANCELLED'],
      ['CANCELED', 'CANCELLED'],
      ['RETURNED', 'RETURNED'],
      ['AWAITING', 'AWAITING_SHIPMENT'],
      ['READY_TO_SHIP', 'AWAITING_SHIPMENT'],
      ['UNKNOWN_STATUS', 'PENDING'],
    ]
    for (const [status, expected] of cases) {
      expect(transformOrder(makeOrder({ status })).status).toBe(expected)
    }
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
