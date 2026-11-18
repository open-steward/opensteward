import { describe, it, expect } from 'vitest'
import {
  parseZonedDate,
  transformTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/skydropx/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { docTrackingEvent } from '../fixtures'

describe('Skydropx transformTrackingEvent (PRO GET /api/v1/shipments/tracking)', () => {
  it('maps the documented example and parses as TrackingEventSchema', () => {
    const out = TrackingEventSchema.parse(
      transformTrackingEvent(docTrackingEvent(), '234234234233', 'fedex'),
    )
    expect(out.id).toBe('0ac5adcc-a13d-427d-81dd-9ddd70b2f660')
    expect(out.trackingNumber).toBe('234234234233')
    expect(out.carrierId).toBe('fedex')
    expect(out.status).toBe('OUT_FOR_DELIVERY')
    expect(out.description).toBe('En ruta de entrega - Cordoba')
  })

  it('does not invent occurredAt from the documented zone-less date', () => {
    const out = transformTrackingEvent(docTrackingEvent(), 'T', 'fedex')
    expect(out.occurredAt).toBeUndefined()
  })

  it('reads a zoned date', () => {
    const out = transformTrackingEvent(
      docTrackingEvent({ date: '2024-09-05T23:13:00-06:00' }),
      'T',
      'fedex',
    )
    expect(out.occurredAt?.toISOString()).toBe('2024-09-06T05:13:00.000Z')
  })

  it.each([
    ['created', 'PRE_TRANSIT'],
    ['picked_up', 'IN_TRANSIT'],
    ['in_transit', 'IN_TRANSIT'],
    ['last_mile', 'OUT_FOR_DELIVERY'],
    ['delivery_attempt', 'FAILURE'],
    ['delivered_to_branch', 'AVAILABLE_FOR_PICKUP'],
    ['delivered', 'DELIVERED'],
    ['exception', 'FAILURE'],
    ['in_return', 'RETURN_TO_SENDER'],
    ['canceled', 'UNKNOWN'],
    ['not_documented', 'UNKNOWN'],
  ])('status %s -> %s', (raw, expected) => {
    const out = TrackingEventSchema.parse(
      transformTrackingEvent(docTrackingEvent({ status: raw }), 'T', 'fedex'),
    )
    expect(out.status).toBe(expected)
  })
})

describe('parseZonedDate', () => {
  it('accepts Z and offsets, rejects zone-less and junk', () => {
    expect(parseZonedDate('2024-09-05T23:13:00Z')?.toISOString()).toBe('2024-09-05T23:13:00.000Z')
    expect(parseZonedDate('2024-09-05T23:13:00.123+02:00')?.toISOString()).toBe(
      '2024-09-05T21:13:00.123Z',
    )
    expect(parseZonedDate('2024-09-05T23:13:00')).toBeUndefined()
    expect(parseZonedDate('2024-09-05')).toBeUndefined()
    expect(parseZonedDate(null)).toBeUndefined()
  })
})
