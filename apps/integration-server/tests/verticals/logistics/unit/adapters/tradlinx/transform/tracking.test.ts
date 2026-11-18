import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  transformTrackingEvents,
  type TradlinxShipment,
  type TradlinxEventsResponse,
  type TradlinxEvent,
} from '../../../../../../../src/verticals/logistics/adapters/tradlinx/transform/tracking'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeRawShipment(overrides: Partial<TradlinxShipment> = {}): TradlinxShipment {
  return {
    id: 'tdl-001',
    status: 'in_transit',
    trackingNumber: 'MSCUTEST001',
    containerNumber: 'MSCU1234567',
    containerType: '40HC',
    bookingNumber: 'BK-100',
    billOfLadingNumber: 'BL-100',
    vesselName: 'MV Acme Star',
    voyageNumber: 'V042E',
    shippingLine: 'Acme Ocean Line',
    portOfLoading: 'CNSHA',
    portOfDischarge: 'USLAX',
    estimatedDeparture: '2024-03-01T00:00:00Z',
    estimatedArrival: '2024-04-01T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-15T00:00:00Z',
    ...overrides,
  }
}

function makeEvent(overrides: Partial<TradlinxEvent> = {}): TradlinxEvent {
  return {
    id: 'evt-1',
    status: 'in_transit',
    description: 'Vessel departed port',
    location: 'Shanghai Port',
    occurredAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeEventsResponse(
  overrides: Partial<TradlinxEventsResponse> = {},
): TradlinxEventsResponse {
  return {
    events: [
      makeEvent(),
      makeEvent({
        id: 'evt-2',
        status: 'arrived',
        description: 'Arrived at LA port',
        location: 'Los Angeles',
      }),
    ],
    ...overrides,
  }
}

// ── transformShipment ─────────────────────────────────────────────────────────

describe('tradlinx transformShipment', () => {
  it('maps id, status, and trackingNumber', () => {
    const result = transformShipment(makeRawShipment())
    expect(result.id).toBe('tdl-001')
    expect(result.trackingNumber).toBe('MSCUTEST001')
    // 'in_transit' → 'IN_TRANSIT'
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('sets mode to "ocean"', () => {
    expect(transformShipment(makeRawShipment()).mode).toBe('ocean')
  })

  it('populates ocean sub-fields when data is present', () => {
    const result = transformShipment(makeRawShipment())
    expect(result.ocean?.containerNumber).toBe('MSCU1234567')
    expect(result.ocean?.vesselName).toBe('MV Acme Star')
    expect(result.ocean?.portOfLoading).toBe('CNSHA')
    expect(result.ocean?.portOfDischarge).toBe('USLAX')
  })

  it('sets ocean.estimatedDeparture and estimatedArrival as Dates', () => {
    const result = transformShipment(makeRawShipment())
    expect(result.ocean?.estimatedDeparture).toBeInstanceOf(Date)
    expect(result.ocean?.estimatedArrival).toBeInstanceOf(Date)
  })

  it('maps "booked" status to PENDING', () => {
    expect(transformShipment(makeRawShipment({ status: 'booked' })).status).toBe('PENDING')
  })

  it('maps "departed" status to IN_TRANSIT', () => {
    expect(transformShipment(makeRawShipment({ status: 'departed' })).status).toBe('IN_TRANSIT')
  })

  it('maps "delivered" status to DELIVERED', () => {
    expect(transformShipment(makeRawShipment({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps "cancelled" status to CANCELLED', () => {
    expect(transformShipment(makeRawShipment({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps "exception" status to EXCEPTION', () => {
    expect(transformShipment(makeRawShipment({ status: 'exception' })).status).toBe('EXCEPTION')
  })

  it('unknown status maps to UNKNOWN', () => {
    expect(transformShipment(makeRawShipment({ status: 'foobar' })).status).toBe('UNKNOWN')
  })

  it('sets createdAt and updatedAt as Dates', () => {
    const result = transformShipment(makeRawShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeRawShipment()))).not.toThrow()
  })

  it('sets ocean to undefined when no ocean data is present', () => {
    const result = transformShipment({
      id: 'tdl-empty',
      status: 'booked',
    })
    expect(result.ocean).toBeUndefined()
  })
})

// ── transformTrackingEvents ───────────────────────────────────────────────────

describe('tradlinx transformTrackingEvents', () => {
  it('returns one event per raw event entry', () => {
    const events = transformTrackingEvents('shp-123', makeEventsResponse())
    expect(events).toHaveLength(2)
  })

  it('attaches shipmentId to each event', () => {
    transformTrackingEvents('shp-123', makeEventsResponse()).forEach((ev) => {
      expect(ev.shipmentId).toBe('shp-123')
    })
  })

  it('maps event id and description', () => {
    const [ev] = transformTrackingEvents('shp-123', makeEventsResponse())
    expect(ev.id).toBe('evt-1')
    expect(ev.description).toBe('Vessel departed port')
  })

  it('maps "in_transit" tracking status to IN_TRANSIT', () => {
    const [ev] = transformTrackingEvents('shp-1', makeEventsResponse())
    expect(ev.status).toBe('IN_TRANSIT')
  })

  it('maps "delivered" tracking status to DELIVERED', () => {
    const [ev] = transformTrackingEvents(
      'shp-1',
      makeEventsResponse({ events: [makeEvent({ status: 'delivered' })] }),
    )
    expect(ev.status).toBe('DELIVERED')
  })

  it('maps "exception" tracking status to FAILURE', () => {
    const [ev] = transformTrackingEvents(
      'shp-1',
      makeEventsResponse({ events: [makeEvent({ status: 'exception' })] }),
    )
    expect(ev.status).toBe('FAILURE')
  })

  it('maps unknown tracking status to UNKNOWN', () => {
    const [ev] = transformTrackingEvents(
      'shp-1',
      makeEventsResponse({ events: [makeEvent({ status: 'somethingelse' })] }),
    )
    expect(ev.status).toBe('UNKNOWN')
  })

  it('wraps location string as street1', () => {
    const [ev] = transformTrackingEvents('shp-123', makeEventsResponse())
    expect(ev.location?.street1).toBe('Shanghai Port')
  })

  it('sets occurredAt as a Date', () => {
    const [ev] = transformTrackingEvents('shp-123', makeEventsResponse())
    expect(ev.occurredAt).toBeInstanceOf(Date)
  })

  it('each event passes TrackingEventSchema.parse', () => {
    transformTrackingEvents('shp-123', makeEventsResponse()).forEach((ev) => {
      expect(() => TrackingEventSchema.parse(ev)).not.toThrow()
    })
  })

  it('returns an empty array when events list is empty', () => {
    expect(transformTrackingEvents('shp-1', { events: [] })).toHaveLength(0)
  })

  it('returns an empty array when events key is absent', () => {
    expect(transformTrackingEvents('shp-1', {})).toHaveLength(0)
  })
})
