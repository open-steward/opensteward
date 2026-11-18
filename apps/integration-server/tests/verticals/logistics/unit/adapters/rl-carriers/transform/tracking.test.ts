import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type RlCarriersTracingResponse,
  type RlCarriersTracingResult,
  type RlCarriersTracingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/rl-carriers/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTracingEvent(overrides: Partial<RlCarriersTracingEvent> = {}): RlCarriersTracingEvent {
  return {
    StatusCode: 'IN',
    StatusDescription: 'in transit',
    EventDateTime: '2024-03-01T10:00:00Z',
    City: 'Chicago',
    State: 'IL',
    Zip: '60601',
    ...overrides,
  }
}

function makeResult(overrides: Partial<RlCarriersTracingResult> = {}): RlCarriersTracingResult {
  return {
    ProNumber: 'PRO-001',
    ShipmentStatus: 'IT',
    ShipmentStatusDescription: 'in transit',
    Events: [makeTracingEvent()],
    ...overrides,
  }
}

function makeRaw(overrides: Partial<RlCarriersTracingResponse> = {}): RlCarriersTracingResponse {
  return {
    ServiceResponse: {
      TraceResults: [makeResult()],
    },
    ...overrides,
  }
}

// ─── transformTrackingEvents ──────────────────────────────────────────────────

describe('RL-Carriers transformTrackingEvents', () => {
  it('produces one event per tracing event', () => {
    const events = transformTrackingEvents(makeRaw(), 'PRO-001')
    expect(events).toHaveLength(1)
  })

  it('maps carrierId to rl-carriers', () => {
    expect(transformTrackingEvents(makeRaw(), 'PRO-001')[0].carrierId).toBe('rl-carriers')
  })

  it('maps trackingNumber from result.ProNumber', () => {
    expect(transformTrackingEvents(makeRaw(), 'PRO-001')[0].trackingNumber).toBe('PRO-001')
  })

  it('maps "in transit" description to IN_TRANSIT status', () => {
    const event = transformTrackingEvents(makeRaw(), 'PRO-001')[0]
    expect(event.status).toBe('IN_TRANSIT')
  })

  it('maps "delivered" description to DELIVERED', () => {
    const raw = makeRaw({
      ServiceResponse: {
        TraceResults: [
          makeResult({ Events: [makeTracingEvent({ StatusDescription: 'delivered' })] }),
        ],
      },
    })
    expect(transformTrackingEvents(raw, 'PRO-001')[0].status).toBe('DELIVERED')
  })

  it('maps "out for delivery" to OUT_FOR_DELIVERY', () => {
    const raw = makeRaw({
      ServiceResponse: {
        TraceResults: [
          makeResult({ Events: [makeTracingEvent({ StatusDescription: 'out for delivery' })] }),
        ],
      },
    })
    expect(transformTrackingEvents(raw, 'PRO-001')[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps "picked up" to PRE_TRANSIT', () => {
    const raw = makeRaw({
      ServiceResponse: {
        TraceResults: [
          makeResult({ Events: [makeTracingEvent({ StatusDescription: 'picked up' })] }),
        ],
      },
    })
    expect(transformTrackingEvents(raw, 'PRO-001')[0].status).toBe('PRE_TRANSIT')
  })

  it('maps "available for pickup" to AVAILABLE_FOR_PICKUP', () => {
    const raw = makeRaw({
      ServiceResponse: {
        TraceResults: [
          makeResult({ Events: [makeTracingEvent({ StatusDescription: 'available for pickup' })] }),
        ],
      },
    })
    expect(transformTrackingEvents(raw, 'PRO-001')[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps location city/state/zip', () => {
    const event = transformTrackingEvents(makeRaw(), 'PRO-001')[0]
    expect(event.location?.city).toBe('Chicago')
    expect(event.location?.state).toBe('IL')
    expect(event.location?.postalCode).toBe('60601')
    expect(event.location?.country).toBe('US')
  })

  it('maps EventDateTime to occurredAt', () => {
    const event = transformTrackingEvents(makeRaw(), 'PRO-001')[0]
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('uses EventDate + EventTime when EventDateTime absent', () => {
    const raw = makeRaw({
      ServiceResponse: {
        TraceResults: [
          makeResult({
            Events: [
              makeTracingEvent({
                EventDateTime: undefined,
                EventDate: '2024-03-01',
                EventTime: '10:30:00',
              }),
            ],
          }),
        ],
      },
    })
    const event = transformTrackingEvents(raw, 'PRO-001')[0]
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('synthesises event from shipment status when Events array is empty', () => {
    const raw = makeRaw({
      ServiceResponse: {
        TraceResults: [makeResult({ Events: [], ShipmentStatusDescription: 'delivered' })],
      },
    })
    const events = transformTrackingEvents(raw, 'PRO-001')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('DELIVERED')
  })

  it('synthesises UNKNOWN event when no results', () => {
    const raw = makeRaw({ ServiceResponse: { TraceResults: [] } })
    const events = transformTrackingEvents(raw, 'PRO-001')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('PRO-001')
  })

  it('passes TrackingEventSchema.parse for each event without throwing', () => {
    const events = transformTrackingEvents(makeRaw(), 'PRO-001')
    events.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })
})
