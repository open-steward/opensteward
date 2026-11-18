import { describe, it, expect } from 'vitest'
import { deliveryToOrder } from '../../../../../../../src/verticals/logistics/adapters/goshare/transform/order'
import type { GoshareDelivery } from '../../../../../../../src/verticals/logistics/adapters/goshare/transform/tracking'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeDelivery(overrides: Partial<GoshareDelivery> = {}): GoshareDelivery {
  return {
    id: 'delivery-001',
    status: 'in_transit',
    pickup_address: {
      name: 'Alice',
      street1: '1 Pickup St',
      city: 'Origin City',
      postalCode: '10001',
      country: 'US',
    },
    delivery_address: {
      name: 'Bob',
      street1: '2 Drop St',
      city: 'Dest City',
      postalCode: '90001',
      country: 'US',
    },
    tracking_number: 'TRK-GOSHARE-001',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    delivered_at: null,
    ...overrides,
  }
}

describe('goshare deliveryToOrder', () => {
  it('maps id and status', () => {
    const result = deliveryToOrder(makeDelivery())
    expect(result.id).toBe('delivery-001')
    expect(result.status).toBe('SHIPPED')
  })

  it('maps createdAt and updatedAt to Date instances', () => {
    const result = deliveryToOrder(makeDelivery())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = deliveryToOrder(makeDelivery())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps originAddress from pickup_address', () => {
    const result = deliveryToOrder(makeDelivery())
    expect(result.originAddress?.name).toBe('Alice')
    expect(result.originAddress?.city).toBe('Origin City')
  })

  it('maps destinationAddress from delivery_address', () => {
    const result = deliveryToOrder(makeDelivery())
    expect(result.destinationAddress?.name).toBe('Bob')
    expect(result.destinationAddress?.city).toBe('Dest City')
  })

  it('maps metadata to raw input', () => {
    const raw = makeDelivery()
    const result = deliveryToOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles null addresses gracefully', () => {
    const result = deliveryToOrder(makeDelivery({ pickup_address: null, delivery_address: null }))
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps status strings to canonical OrderStatus values', () => {
    const cases: Array<[string, string]> = [
      ['pending', 'PENDING'],
      ['created', 'PENDING'],
      ['searching_driver', 'PENDING'],
      ['driver_assigned', 'PROCESSING'],
      ['picked_up', 'PROCESSING'],
      ['in_transit', 'SHIPPED'],
      ['out_for_delivery', 'SHIPPED'],
      ['delivered', 'DELIVERED'],
      ['completed', 'DELIVERED'],
      ['returned', 'RETURNED'],
      ['return_to_sender', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['something_unknown', 'UNKNOWN'],
    ]
    for (const [raw, expected] of cases) {
      expect(deliveryToOrder(makeDelivery({ status: raw })).status).toBe(expected)
    }
  })

  it('handles null status', () => {
    const result = deliveryToOrder(makeDelivery({ status: null }))
    expect(result.status).toBe('UNKNOWN')
  })

  it('sets deliveredAt when delivered_at is present', () => {
    const result = deliveryToOrder(makeDelivery({ delivered_at: '2024-03-01T18:00:00Z' }))
    expect(result.deliveredAt).toBeInstanceOf(Date)
  })
})
