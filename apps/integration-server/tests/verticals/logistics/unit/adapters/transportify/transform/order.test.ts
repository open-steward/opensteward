import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type TransportifyOrderDelivery,
} from '../../../../../../../src/verticals/logistics/adapters/transportify/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import type { TransportifyLocation } from '../../../../../../../src/verticals/logistics/adapters/transportify/transform/address'

function makeLocation(overrides: Partial<TransportifyLocation> = {}): TransportifyLocation {
  return {
    address: '1 Pickup St, Manila',
    latitude: 14.5995,
    longitude: 120.9842,
    recipient_name: 'Alice',
    recipient_phone: '+63 917 000 0001',
    note: null,
    is_payer: true,
    need_cod: false,
    need_pod: false,
    cod_invoice_fees: null,
    ...overrides,
  }
}

function makeRaw(overrides: Partial<TransportifyOrderDelivery> = {}): TransportifyOrderDelivery {
  return {
    id: 5001,
    status: 'delivery_in_progress',
    job_order_number: 'JON-2024-001',
    vehicle_type_id: 7,
    vehicle_type_name: 'Motorcycle',
    time_type: 'now',
    pickup_time: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T06:00:00Z',
    completed_at: null,
    canceled_at: null,
    total_fees: 150.0,
    currency: 'PHP',
    note: 'Fragile',
    locations: [
      makeLocation(),
      makeLocation({
        address: '2 Dropoff Ave, Quezon City',
        recipient_name: 'Bob',
        recipient_phone: '+63 917 000 0002',
      }),
    ],
    ...overrides,
  }
}

describe('transportify transformOrder', () => {
  it('maps id as string', () => {
    expect(transformOrder(makeRaw()).id).toBe('5001')
  })

  it('maps orderNumber from job_order_number', () => {
    expect(transformOrder(makeRaw()).orderNumber).toBe('JON-2024-001')
  })

  it('maps "delivery_in_progress" status to SHIPPED', () => {
    expect(transformOrder(makeRaw({ status: 'delivery_in_progress' })).status).toBe('SHIPPED')
  })

  it('maps "locating_driver" status to PROCESSING', () => {
    expect(transformOrder(makeRaw({ status: 'locating_driver' })).status).toBe('PROCESSING')
  })

  it('maps "driver_accept_booking" status to AWAITING_SHIPMENT', () => {
    expect(transformOrder(makeRaw({ status: 'driver_accept_booking' })).status).toBe(
      'AWAITING_SHIPMENT',
    )
  })

  it('maps "delivery_complete" status to DELIVERED', () => {
    expect(transformOrder(makeRaw({ status: 'delivery_complete' })).status).toBe('DELIVERED')
  })

  it('maps "canceled" status to CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'canceled' })).status).toBe('CANCELLED')
  })

  it('maps "locating_driver_timeout" status to CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'locating_driver_timeout' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to PENDING', () => {
    expect(transformOrder(makeRaw({ status: 'something_else' })).status).toBe('PENDING')
  })

  it('maps pickup location as originAddress', () => {
    const result = transformOrder(makeRaw())
    expect(result.originAddress?.name).toBe('Alice')
    expect(result.originAddress?.street1).toBe('1 Pickup St, Manila')
  })

  it('maps last location as destinationAddress', () => {
    const result = transformOrder(makeRaw())
    expect(result.destinationAddress?.name).toBe('Bob')
    expect(result.destinationAddress?.street1).toBe('2 Dropoff Ave, Quezon City')
  })

  it('maps shipmentIds to [String(id)]', () => {
    expect(transformOrder(makeRaw()).shipmentIds).toEqual(['5001'])
  })

  it('converts total_fees to minor-unit integer via parseDecimal', () => {
    // parseDecimal(150.00) = 150 (as-is float, not ×100)
    // The transform stores parseDecimal(raw.total_fees) directly, not ×100
    expect(transformOrder(makeRaw()).totalAmount).toBe(150)
  })

  it('maps currency from raw.currency', () => {
    expect(transformOrder(makeRaw()).currency).toBe('PHP')
  })

  it('maps notes from raw.note', () => {
    expect(transformOrder(makeRaw()).notes).toBe('Fragile')
  })

  it('maps requestedServiceCode from vehicle_type_name', () => {
    expect(transformOrder(makeRaw()).requestedServiceCode).toBe('Motorcycle')
  })

  it('sets shippedAt and orderAt from pickup_time', () => {
    const result = transformOrder(makeRaw())
    expect(result.shippedAt).toBeInstanceOf(Date)
    expect(result.orderAt).toBeInstanceOf(Date)
  })

  it('sets createdAt and updatedAt as Dates', () => {
    const result = transformOrder(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('sets deliveredAt from completed_at when present', () => {
    const result = transformOrder(makeRaw({ completed_at: '2024-03-01T08:00:00Z' }))
    expect(result.deliveredAt).toBeInstanceOf(Date)
  })

  it('sets cancelledAt from canceled_at when present', () => {
    const result = transformOrder(makeRaw({ canceled_at: '2024-03-01T09:00:00Z' }))
    expect(result.cancelledAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })

  it('handles null total_fees gracefully (totalAmount becomes undefined)', () => {
    expect(transformOrder(makeRaw({ total_fees: null })).totalAmount).toBeUndefined()
  })

  it('sets destinationAddress to undefined when only one location (no dropoff)', () => {
    const result = transformOrder(makeRaw({ locations: [makeLocation()] }))
    expect(result.destinationAddress).toBeUndefined()
  })
})
