import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type DeliverooOrderRaw,
} from '../../../../../../../src/verticals/logistics/adapters/deliveroo/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeOrder(overrides: Partial<DeliverooOrderRaw> = {}): DeliverooOrderRaw {
  return {
    id: 'del-order-001',
    status: 'rider_in_transit',
    restaurant_id: 'rest-456',
    partner_fee_fractional: 350,
    currency: 'GBP',
    tracking_url: 'https://track.deliveroo.com/del-order-001',
    delivery_eta: '2024-03-01T13:30:00Z',
    created_at: '2024-03-01T12:00:00Z',
    updated_at: '2024-03-01T13:00:00Z',
    customer: {
      full_name: 'Alice Baker',
      phone_number: '+447700900000',
      email: 'alice@example.com',
    },
    address: {
      address1: '221B Baker Street',
      city: 'London',
      postcode: 'NW1 6XE',
      country_code: 'GB',
    },
    ...overrides,
  }
}

describe('deliveroo transformShipment', () => {
  it('maps id', () => {
    const result = transformShipment(makeOrder())
    expect(result.id).toBe('del-order-001')
  })

  it('uses id as trackingNumber', () => {
    const result = transformShipment(makeOrder())
    expect(result.trackingNumber).toBe('del-order-001')
  })

  it('sets carrierId to deliveroo', () => {
    const result = transformShipment(makeOrder())
    expect(result.carrierId).toBe('deliveroo')
  })

  it('maps rider_in_transit to IN_TRANSIT', () => {
    const result = transformShipment(makeOrder())
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps rider_nearby to OUT_FOR_DELIVERY', () => {
    const result = transformShipment(makeOrder({ status: 'rider_nearby' }))
    expect(result.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps delivered to DELIVERED', () => {
    const result = transformShipment(makeOrder({ status: 'delivered' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps cancelled to CANCELLED', () => {
    const result = transformShipment(makeOrder({ status: 'canceled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps tracking_url to labelUrl', () => {
    const result = transformShipment(makeOrder())
    expect(result.labelUrl).toBe('https://track.deliveroo.com/del-order-001')
  })

  it('maps cost with amount and currency', () => {
    const result = transformShipment(makeOrder())
    expect(result.cost?.amount).toBe(350)
    expect(result.cost?.currency).toBe('GBP')
  })

  it('maps estimatedDeliveryAt from delivery_eta', () => {
    const result = transformShipment(makeOrder())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.estimatedDeliveryAt?.toISOString()).toBe('2024-03-01T13:30:00.000Z')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformShipment(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps destination address from customer + address', () => {
    const result = transformShipment(makeOrder())
    expect(result.destinationAddress?.name).toBe('Alice Baker')
  })

  it('passes schema validation', () => {
    const result = transformShipment(makeOrder())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('handles missing customer and address', () => {
    const result = transformShipment(makeOrder({ customer: null, address: null }))
    expect(result.destinationAddress).toBeUndefined()
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
