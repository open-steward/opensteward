import { describe, it, expect } from 'vitest'
import { transformDeliveryTracking } from '../../../../../../../src/verticals/logistics/adapters/deliveree/transform/tracking'
import type { DelivereeDelivery } from '../../../../../../../src/verticals/logistics/adapters/deliveree/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeDelivery(overrides: Partial<DelivereeDelivery> = {}): DelivereeDelivery {
  return {
    id: 9001,
    status: 'delivery_in_progress',
    job_order_number: 'JOB-001',
    created_at: '2024-03-01T00:00:00Z',
    pickup_time: '2024-03-01T08:00:00Z',
    ...overrides,
  }
}

describe('deliveree transformDeliveryTracking', () => {
  it('returns an array with exactly one event', () => {
    const result = transformDeliveryTracking(makeDelivery())
    expect(result).toHaveLength(1)
  })

  it('maps shipmentId from raw.id', () => {
    const result = transformDeliveryTracking(makeDelivery())
    expect(result[0].shipmentId).toBe('9001')
  })

  it('sets carrierId to deliveree', () => {
    const result = transformDeliveryTracking(makeDelivery())
    expect(result[0].carrierId).toBe('deliveree')
  })

  it('maps delivery_in_progress to IN_TRANSIT', () => {
    const result = transformDeliveryTracking(makeDelivery())
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps description from raw.status', () => {
    const result = transformDeliveryTracking(makeDelivery())
    expect(result[0].description).toBe('delivery_in_progress')
  })

  it('uses pickup_time for occurredAt when present', () => {
    const result = transformDeliveryTracking(makeDelivery())
    expect(result[0].occurredAt).toBeInstanceOf(Date)
    expect(result[0].occurredAt?.toISOString()).toBe('2024-03-01T08:00:00.000Z')
  })

  it('falls back to created_at when pickup_time is absent', () => {
    const result = transformDeliveryTracking(makeDelivery({ pickup_time: null }))
    expect(result[0].occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes schema validation', () => {
    const result = transformDeliveryTracking(makeDelivery())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('maps status delivery_complete to DELIVERED', () => {
    const result = transformDeliveryTracking(makeDelivery({ status: 'delivery_complete' }))
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps status locating_driver to PRE_TRANSIT', () => {
    const result = transformDeliveryTracking(makeDelivery({ status: 'locating_driver' }))
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status canceled to RETURN_TO_SENDER', () => {
    const result = transformDeliveryTracking(makeDelivery({ status: 'canceled' }))
    expect(result[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps unknown status to UNKNOWN', () => {
    const result = transformDeliveryTracking(makeDelivery({ status: 'something_weird' }))
    expect(result[0].status).toBe('UNKNOWN')
  })
})
