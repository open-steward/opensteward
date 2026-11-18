import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type TransportifyDelivery,
} from '../../../../../../../src/verticals/logistics/adapters/transportify/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
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

function makeRaw(overrides: Partial<TransportifyDelivery> = {}): TransportifyDelivery {
  return {
    id: 5001,
    status: 'delivery_in_progress',
    note: 'Handle with care',
    job_order_number: 'JON-2024-001',
    vehicle_type_id: 7,
    vehicle_type_name: 'Motorcycle',
    time_type: 'now',
    pickup_time: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T06:00:00Z',
    completed_at: null,
    canceled_at: null,
    total_fees: 200.0,
    currency: 'PHP',
    tracking_url: 'https://app.transportify.com/track/5001',
    locations: [
      makeLocation(),
      makeLocation({
        address: '2 Dropoff Ave, Quezon City',
        recipient_name: 'Bob',
        recipient_phone: '+63 917 000 0002',
      }),
    ],
    driver: { id: 42, name: 'Driver Joe', phone: '+63 920 000 0099' },
    ...overrides,
  }
}

describe('transportify transformShipment', () => {
  it('maps id as string', () => {
    expect(transformShipment(makeRaw()).id).toBe('5001')
  })

  it('sets carrierId to "transportify"', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('transportify')
  })

  it('maps "delivery_in_progress" status to IN_TRANSIT', () => {
    expect(transformShipment(makeRaw({ status: 'delivery_in_progress' })).status).toBe('IN_TRANSIT')
  })

  it('maps "locating_driver" status to PENDING', () => {
    expect(transformShipment(makeRaw({ status: 'locating_driver' })).status).toBe('PENDING')
  })

  it('maps "driver_accept_booking" status to LABEL_CREATED', () => {
    expect(transformShipment(makeRaw({ status: 'driver_accept_booking' })).status).toBe(
      'LABEL_CREATED',
    )
  })

  it('maps "delivery_complete" status to DELIVERED', () => {
    expect(transformShipment(makeRaw({ status: 'delivery_complete' })).status).toBe('DELIVERED')
  })

  it('maps "canceled" status to CANCELLED', () => {
    expect(transformShipment(makeRaw({ status: 'canceled' })).status).toBe('CANCELLED')
  })

  it('maps "locating_driver_timeout" status to EXCEPTION', () => {
    expect(transformShipment(makeRaw({ status: 'locating_driver_timeout' })).status).toBe(
      'EXCEPTION',
    )
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformShipment(makeRaw({ status: 'something_weird' })).status).toBe('UNKNOWN')
  })

  it('uses vehicle_type_name as serviceCode', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('Motorcycle')
  })

  it('falls back to stringified vehicle_type_id when vehicle_type_name is null', () => {
    expect(transformShipment(makeRaw({ vehicle_type_name: null })).serviceCode).toBe('7')
  })

  it('maps pickup location as originAddress', () => {
    const result = transformShipment(makeRaw())
    expect(result.originAddress?.name).toBe('Alice')
    expect(result.originAddress?.street1).toBe('1 Pickup St, Manila')
  })

  it('maps last location as destinationAddress', () => {
    const result = transformShipment(makeRaw())
    expect(result.destinationAddress?.name).toBe('Bob')
  })

  it('maps cost amount and currency', () => {
    const result = transformShipment(makeRaw())
    // parseDecimal(200.0) = 200
    expect(result.cost?.amount).toBe(200)
    expect(result.cost?.currency).toBe('PHP')
  })

  it('omits cost when total_fees is null', () => {
    expect(transformShipment(makeRaw({ total_fees: null })).cost).toBeUndefined()
  })

  it('maps reference from job_order_number', () => {
    expect(transformShipment(makeRaw()).reference).toBe('JON-2024-001')
  })

  it('maps notes from raw.note', () => {
    expect(transformShipment(makeRaw()).notes).toBe('Handle with care')
  })

  it('sets estimatedDeliveryAt from pickup_time', () => {
    expect(transformShipment(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('sets actualDeliveryAt from completed_at when present', () => {
    const result = transformShipment(makeRaw({ completed_at: '2024-03-01T12:00:00Z' }))
    expect(result.actualDeliveryAt).toBeInstanceOf(Date)
  })

  it('sets createdAt and updatedAt as Dates', () => {
    const result = transformShipment(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeRaw()))).not.toThrow()
  })

  it('handles empty locations array — origin and destination become undefined', () => {
    const result = transformShipment(makeRaw({ locations: [] }))
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })
})
