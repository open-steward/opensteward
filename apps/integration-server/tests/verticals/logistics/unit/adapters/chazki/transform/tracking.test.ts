import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ChazkiTrackingResponse,
  type ChazkiTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/chazki/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ChazkiTrackingEvent> = {}): ChazkiTrackingEvent {
  return {
    status: 'GOTO_DELIVER',
    description: 'En camino',
    city: 'Lima',
    country: 'PE',
    occurred_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<ChazkiTrackingResponse> = {}): ChazkiTrackingResponse {
  return {
    tracking_number: 'TRK-001',
    status: 'DELIVERED',
    shipment_id: 'shp-001',
    carrier: 'chazki',
    created_at: '2024-03-01T00:00:00Z',
    events: [
      makeEvent(),
      makeEvent({
        status: 'DELIVERED',
        description: 'Entregado',
        city: 'Cusco',
        occurred_at: '2024-03-01T12:00:00Z',
      }),
    ],
    ...overrides,
  }
}

// ─── Core field mapping ───────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('returns an event for each entry in events array', () => {
    const results = transformTracking(makeTracking())
    expect(results).toHaveLength(2)
  })

  it('maps first event fields correctly', () => {
    const [first] = transformTracking(makeTracking())

    expect(first.trackingNumber).toBe('TRK-001')
    expect(first.carrierId).toBe('chazki')
    expect(first.status).toBe('IN_TRANSIT')
    expect(first.description).toBe('En camino')
    expect(first.location?.city).toBe('Lima')
    expect(first.location?.country).toBe('PE')
    expect(first.occurredAt).toBeInstanceOf(Date)
  })

  it('each event passes TrackingEventSchema validation', () => {
    const results = transformTracking(makeTracking())
    for (const event of results) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })

  // ─── Synthetic event when no detail events ────────────────────────────────

  it('emits one synthetic event from top-level status when events is empty', () => {
    const results = transformTracking(makeTracking({ events: [] }))
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('DELIVERED')
    expect(results[0].trackingNumber).toBe('TRK-001')
  })

  it('synthetic event passes TrackingEventSchema validation', () => {
    const results = transformTracking(makeTracking({ events: [] }))
    expect(() => TrackingEventSchema.parse(results[0])).not.toThrow()
  })

  // ─── Tracking number fallback ────────────────────────────────────────────────

  it('falls back to tracking_code when tracking_number is null', () => {
    const results = transformTracking(
      makeTracking({ tracking_number: null, tracking_code: 'CODE-XYZ' }),
    )
    expect(results[0].trackingNumber).toBe('CODE-XYZ')
  })

  it('falls back to code when tracking_number and tracking_code are null', () => {
    const results = transformTracking(
      makeTracking({ tracking_number: null, tracking_code: null, code: 'CHZ-DIRECT' }),
    )
    expect(results[0].trackingNumber).toBe('CHZ-DIRECT')
  })

  // ─── Status mapping ─────────────────────────────────────────────────────────

  describe('event status mapping', () => {
    it.each([
      ['PRE_TRANSITO', 'PRE_TRANSIT'],
      ['PICKUP', 'IN_TRANSIT'],
      ['ARRIVED_DELIVER', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['DISPONIBLE_PARA_RECOJO', 'AVAILABLE_FOR_PICKUP'],
      ['DEVUELTO', 'RETURN_TO_SENDER'],
      ['FAILED_PICK', 'FAILURE'],
    ] as const)('maps %s → %s', (chazkiStatus, expected) => {
      const results = transformTracking(
        makeTracking({ events: [makeEvent({ status: chazkiStatus })] }),
      )
      expect(results[0].status).toBe(expected)
    })
  })

  // ─── Location handling ───────────────────────────────────────────────────────

  it('returns undefined location when city, state, and country are all missing', () => {
    const results = transformTracking(
      makeTracking({
        events: [
          makeEvent({ city: undefined, state: undefined, country: undefined, location: undefined }),
        ],
      }),
    )
    expect(results[0].location).toBeUndefined()
  })

  it('includes state in location when present', () => {
    const results = transformTracking(
      makeTracking({
        events: [makeEvent({ city: 'Lima', state: 'Lima Region', country: 'PE' })],
      }),
    )
    expect(results[0].location?.state).toBe('Lima Region')
  })

  // ─── Default carrierId ───────────────────────────────────────────────────────

  it('defaults carrierId to chazki when carrier is null', () => {
    const results = transformTracking(makeTracking({ carrier: null }))
    expect(results[0].carrierId).toBe('chazki')
  })

  // ─── Alternative event arrays ────────────────────────────────────────────────

  it('uses tracking_events when events is absent', () => {
    const results = transformTracking(
      makeTracking({
        events: undefined,
        tracking_events: [makeEvent({ status: 'COLLECTED', description: 'Recogido' })],
      }),
    )
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('IN_TRANSIT')
  })

  it('uses history when events and tracking_events are absent', () => {
    const results = transformTracking(
      makeTracking({
        events: undefined,
        tracking_events: undefined,
        history: [makeEvent({ status: 'NEW' })],
      }),
    )
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('PRE_TRANSIT')
  })
})
