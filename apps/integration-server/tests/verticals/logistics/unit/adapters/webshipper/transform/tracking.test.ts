import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  transformTrackingEvents,
  type WebshipperTrackingEvent,
  type WebshipperTrackingListResponse,
} from '../../../../../../../src/verticals/logistics/adapters/webshipper/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeRaw(overrides: Partial<WebshipperTrackingEvent> = {}): WebshipperTrackingEvent {
  return {
    id: 200,
    type: 'tracking_events',
    attributes: {
      status: 'in_transit',
      description: 'Package in transit',
      event_time: '2024-03-01T00:00:00Z',
      location: 'Frankfurt, DE',
      tracking_number: 'TRK-WS-001',
      shipment_id: 'ws-shp-001',
    },
    ...overrides,
  }
}

describe('transformTrackingEvent (webshipper)', () => {
  it('maps id to string from raw.id', () => {
    expect(transformTrackingEvent(makeRaw()).id).toBe('200')
  })

  it('maps shipmentId from attributes.shipment_id', () => {
    expect(transformTrackingEvent(makeRaw()).shipmentId).toBe('ws-shp-001')
  })

  it('maps trackingNumber from attributes.tracking_number', () => {
    expect(transformTrackingEvent(makeRaw()).trackingNumber).toBe('TRK-WS-001')
  })

  it('sets carrierId to webshipper', () => {
    expect(transformTrackingEvent(makeRaw()).carrierId).toBe('webshipper')
  })

  it('maps status in_transit → IN_TRANSIT', () => {
    expect(transformTrackingEvent(makeRaw()).status).toBe('IN_TRANSIT')
  })

  it('maps status label_created → PRE_TRANSIT', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'label_created' } })
    expect(transformTrackingEvent(raw).status).toBe('PRE_TRANSIT')
  })

  it('maps status out_for_delivery → OUT_FOR_DELIVERY', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'out_for_delivery' } })
    expect(transformTrackingEvent(raw).status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps status delivered → DELIVERED', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'delivered' } })
    expect(transformTrackingEvent(raw).status).toBe('DELIVERED')
  })

  it('maps status available_for_pickup → AVAILABLE_FOR_PICKUP', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'available_for_pickup' } })
    expect(transformTrackingEvent(raw).status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps status returned → RETURN_TO_SENDER', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'returned' } })
    expect(transformTrackingEvent(raw).status).toBe('RETURN_TO_SENDER')
  })

  it('maps status exception → FAILURE', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'exception' } })
    expect(transformTrackingEvent(raw).status).toBe('FAILURE')
  })

  it('maps unknown status → UNKNOWN', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'weird_status' } })
    expect(transformTrackingEvent(raw).status).toBe('UNKNOWN')
  })

  it('maps description from attributes.description', () => {
    expect(transformTrackingEvent(makeRaw()).description).toBe('Package in transit')
  })

  it('maps occurredAt from attributes.event_time', () => {
    expect(transformTrackingEvent(makeRaw()).occurredAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformTrackingEvent(raw).metadata).toBe(raw)
  })

  it('produces output that parses against TrackingEventSchema', () => {
    expect(() => TrackingEventSchema.parse(transformTrackingEvent(makeRaw()))).not.toThrow()
  })
})

describe('transformTrackingEvents (webshipper)', () => {
  it('maps all events in response.data', () => {
    const response: WebshipperTrackingListResponse = {
      data: [makeRaw(), makeRaw({ id: 201 })],
    }
    expect(transformTrackingEvents(response)).toHaveLength(2)
  })

  it('returns empty array when data is absent', () => {
    expect(transformTrackingEvents({})).toHaveLength(0)
  })
})
