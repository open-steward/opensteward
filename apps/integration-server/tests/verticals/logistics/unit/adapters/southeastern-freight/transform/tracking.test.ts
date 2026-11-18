import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type SeflTracingResponse,
  type SeflTrackingEventRaw,
} from '../../../../../../../src/verticals/logistics/adapters/southeastern-freight/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<SeflTrackingEventRaw> = {}): SeflTrackingEventRaw {
  return {
    dateTime: '2024-03-01T08:00:00Z',
    status: 'Picked Up',
    description: 'Picked up from shipper',
    city: 'Columbia',
    state: 'SC',
    zip: '29201',
    ...overrides,
  }
}

function makeResponse(overrides: Partial<SeflTracingResponse> = {}): SeflTracingResponse {
  return {
    shipment: {
      proNumber: 'PRO-SEFL-001',
      status: 'In Transit',
      statusDescription: 'Shipment is in transit',
      events: [
        makeEvent(),
        makeEvent({ status: 'In Transit', city: 'Charlotte', state: 'NC', zip: '28201' }),
      ],
    },
    ...overrides,
  }
}

describe('southeastern-freight transformTrackingEvents', () => {
  it('produces one event per shipment event', () => {
    expect(transformTrackingEvents(makeResponse())).toHaveLength(2)
  })

  it('maps trackingNumber from shipment.proNumber', () => {
    const events = transformTrackingEvents(makeResponse())
    expect(events[0].trackingNumber).toBe('PRO-SEFL-001')
  })

  it('maps carrierId to southeastern-freight', () => {
    const events = transformTrackingEvents(makeResponse())
    expect(events[0].carrierId).toBe('southeastern-freight')
  })

  it('maps status from TRACKING_STATUS_MAP (Picked Up → PRE_TRANSIT)', () => {
    const events = transformTrackingEvents(makeResponse())
    expect(events[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status (In Transit → IN_TRANSIT)', () => {
    const events = transformTrackingEvents(makeResponse())
    expect(events[1].status).toBe('IN_TRANSIT')
  })

  it('maps description from event description', () => {
    const events = transformTrackingEvents(makeResponse())
    expect(events[0].description).toBe('Picked up from shipper')
  })

  it('maps location from city/state/zip', () => {
    const events = transformTrackingEvents(makeResponse())
    expect(events[0].location?.city).toBe('Columbia')
    expect(events[0].location?.state).toBe('SC')
    expect(events[0].location?.postalCode).toBe('29201')
    expect(events[0].location?.country).toBe('US')
  })

  it('maps occurredAt from dateTime', () => {
    const events = transformTrackingEvents(makeResponse())
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('parses date + time fallback when dateTime is absent', () => {
    const raw: SeflTracingResponse = {
      shipment: {
        proNumber: 'PRO-001',
        events: [{ date: '2024-03-01', time: '08:00:00', status: 'Delivered', description: 'D' }],
      },
    }
    const events = transformTrackingEvents(raw)
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('synthesises a single fallback event when events array is empty', () => {
    const raw: SeflTracingResponse = {
      shipment: {
        proNumber: 'PRO-001',
        status: 'Delivered',
        statusDescription: 'Delivered to customer',
        events: [],
      },
    }
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('DELIVERED')
    expect(events[0].description).toBe('Delivered to customer')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw: SeflTracingResponse = {
      shipment: {
        proNumber: 'PRO-001',
        events: [{ status: 'SomeWeirdStatus', dateTime: '2024-03-01T00:00:00Z' }],
      },
    }
    const events = transformTrackingEvents(raw)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('supports top-level envelope (no nested shipment object)', () => {
    const raw: SeflTracingResponse = {
      proNumber: 'PRO-TOP',
      status: 'In Transit',
      events: [makeEvent({ status: 'In Transit' })],
    }
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe('PRO-TOP')
  })

  it('preserves metadata on each event', () => {
    const events = transformTrackingEvents(makeResponse())
    for (const e of events) {
      expect(e.metadata).toBeDefined()
    }
  })

  it('produces schema-valid TrackingEvent objects', () => {
    const events = transformTrackingEvents(makeResponse())
    for (const e of events) {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    }
  })
})
