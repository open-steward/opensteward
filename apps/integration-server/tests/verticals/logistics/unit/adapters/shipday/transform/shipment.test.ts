import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/shipday/transform/shipment'
import type { ShipdayOrder } from '../../../../../../../src/verticals/logistics/adapters/shipday/transform/order'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeOrder(overrides: Partial<ShipdayOrder> = {}): ShipdayOrder {
  return {
    orderId: 1001,
    orderNumber: 'SD-ORD-001',
    status: 'PICKED_UP',
    customerName: 'Jane Doe',
    customerAddress: '100 Main St, San Francisco',
    customerEmail: 'jane.doe@acme.example',
    customerPhoneNumber: '+14155550123',
    pickupName: 'Acme Warehouse',
    pickupPhoneNumber: '+14155550100',
    pickup: {
      name: 'Acme Warehouse',
      phone_number: '+14155550100',
      address: {
        street: '1 Market St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105',
        country: 'US',
      },
    },
    customer: {
      name: 'Jane Doe',
      email: 'jane.doe@acme.example',
      phone_number: '+14155550123',
      address: {
        street: '100 Main St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94114',
        country: 'US',
      },
    },
    expectedDeliveryDate: '2024-03-02T00:00:00Z',
    orderTime: '2024-03-01T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T08:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (shipday)', () => {
  it('maps id from orderId (string-coerced)', () => {
    expect(transformShipment(makeOrder()).id).toBe('1001')
  })

  it('maps trackingNumber from orderNumber', () => {
    expect(transformShipment(makeOrder()).trackingNumber).toBe('SD-ORD-001')
  })

  it('carrierId is always shipday', () => {
    expect(transformShipment(makeOrder()).carrierId).toBe('shipday')
  })

  it('maps status: PICKED_UP → IN_TRANSIT', () => {
    expect(transformShipment(makeOrder({ status: 'PICKED_UP' })).status).toBe('IN_TRANSIT')
  })

  it('maps reference from orderNumber', () => {
    expect(transformShipment(makeOrder()).reference).toBe('SD-ORD-001')
  })

  it('maps destinationAddress from nested customer.address', () => {
    const result = transformShipment(makeOrder())
    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.city).toBe('San Francisco')
    expect(result.destinationAddress?.postalCode).toBe('94114')
  })

  it('maps originAddress from nested pickup.address', () => {
    const result = transformShipment(makeOrder())
    expect(result.originAddress?.name).toBe('Acme Warehouse')
    expect(result.originAddress?.city).toBe('San Francisco')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeOrder()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt as Date', () => {
    expect(transformShipment(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['ASSIGNED', 'LABEL_CREATED'],
      ['ACCEPTED', 'LABEL_CREATED'],
      ['STARTED', 'IN_TRANSIT'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['CANCELLED', 'CANCELLED'],
      ['CANCELED', 'CANCELLED'],
      ['RETURNED', 'RETURNED'],
      ['UNKNOWN_STATUS', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeOrder({ status })).status).toBe(expected)
    }
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformShipment(makeOrder())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
