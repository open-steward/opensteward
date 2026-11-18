import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type TransportifyTrackingDelivery,
} from '../../../../../../../src/verticals/logistics/adapters/transportify/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import type { TransportifyLocation } from '../../../../../../../src/verticals/logistics/adapters/transportify/transform/address'

function makeLocation(overrides: Partial<TransportifyLocation> = {}): TransportifyLocation {
  return {
    address: '1 Pickup St, Manila',
    latitude: 14.5995,
    longitude: 120.9842,
    recipient_name: 'Alice',
    recipient_phone: '+63 917 000 0001',
    note: null,
    is_payer: false,
    need_cod: false,
    need_pod: false,
    cod_invoice_fees: null,
    ...overrides,
  }
}

function makeRaw(
  overrides: Partial<TransportifyTrackingDelivery> = {},
): TransportifyTrackingDelivery {
  return {
    id: 5001,
    status: 'delivery_in_progress',
    job_order_number: 'JON-2024-001',
    tracking_url: 'https://app.transportify.com/track/5001',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T06:00:00Z',
    completed_at: null,
    canceled_at: null,
    locations: [makeLocation()],
    ...overrides,
  }
}

describe('transportify transformTrackingEvents', () => {
  it('always returns exactly one synthetic event', () => {
    expect(transformTrackingEvents(makeRaw())).toHaveLength(1)
  })

  it('sets shipmentId to String(raw.id)', () => {
    expect(transformTrackingEvents(makeRaw())[0].shipmentId).toBe('5001')
  })

  it('sets trackingNumber from job_order_number', () => {
    expect(transformTrackingEvents(makeRaw())[0].trackingNumber).toBe('JON-2024-001')
  })

  it('falls back to String(id) as trackingNumber when job_order_number is null', () => {
    const [ev] = transformTrackingEvents(makeRaw({ job_order_number: null }))
    expect(ev.trackingNumber).toBe('5001')
  })

  it('sets carrierId to "transportify"', () => {
    expect(transformTrackingEvents(makeRaw())[0].carrierId).toBe('transportify')
  })

  it('maps "delivery_in_progress" status to IN_TRANSIT', () => {
    expect(transformTrackingEvents(makeRaw({ status: 'delivery_in_progress' }))[0].status).toBe(
      'IN_TRANSIT',
    )
  })

  it('maps "locating_driver" status to PRE_TRANSIT', () => {
    expect(transformTrackingEvents(makeRaw({ status: 'locating_driver' }))[0].status).toBe(
      'PRE_TRANSIT',
    )
  })

  it('maps "driver_accept_booking" status to PRE_TRANSIT', () => {
    expect(transformTrackingEvents(makeRaw({ status: 'driver_accept_booking' }))[0].status).toBe(
      'PRE_TRANSIT',
    )
  })

  it('maps "delivery_complete" status to DELIVERED', () => {
    expect(transformTrackingEvents(makeRaw({ status: 'delivery_complete' }))[0].status).toBe(
      'DELIVERED',
    )
  })

  it('maps "canceled" status to FAILURE', () => {
    expect(transformTrackingEvents(makeRaw({ status: 'canceled' }))[0].status).toBe('FAILURE')
  })

  it('maps "locating_driver_timeout" status to FAILURE', () => {
    expect(transformTrackingEvents(makeRaw({ status: 'locating_driver_timeout' }))[0].status).toBe(
      'FAILURE',
    )
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformTrackingEvents(makeRaw({ status: 'whatever' }))[0].status).toBe('UNKNOWN')
  })

  it('sets description from status label', () => {
    expect(
      transformTrackingEvents(makeRaw({ status: 'delivery_in_progress' }))[0].description,
    ).toBe('Delivery in progress')
  })

  it('sets description to undefined for unknown status', () => {
    expect(transformTrackingEvents(makeRaw({ status: 'mystery' }))[0].description).toBeUndefined()
  })

  it('maps current location from first non-null location', () => {
    const [ev] = transformTrackingEvents(makeRaw())
    expect(ev.location?.name).toBe('Alice')
    expect(ev.location?.street1).toBe('1 Pickup St, Manila')
  })

  it('sets occurredAt from updated_at for in-progress deliveries', () => {
    const [ev] = transformTrackingEvents(makeRaw({ status: 'delivery_in_progress' }))
    expect(ev.occurredAt).toBeInstanceOf(Date)
  })

  it('sets occurredAt from completed_at for delivered status', () => {
    const [ev] = transformTrackingEvents(
      makeRaw({
        status: 'delivery_complete',
        completed_at: '2024-03-01T12:00:00Z',
      }),
    )
    expect(ev.occurredAt).toBeInstanceOf(Date)
  })

  it('sets occurredAt from canceled_at for canceled status', () => {
    const [ev] = transformTrackingEvents(
      makeRaw({
        status: 'canceled',
        canceled_at: '2024-03-01T09:00:00Z',
      }),
    )
    expect(ev.occurredAt).toBeInstanceOf(Date)
  })

  it('sets createdAt from raw.created_at', () => {
    expect(transformTrackingEvents(makeRaw())[0].createdAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    expect(() => TrackingEventSchema.parse(transformTrackingEvents(makeRaw())[0])).not.toThrow()
  })
})
