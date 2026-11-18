import { describe, it, expect } from 'vitest'
import {
  transformUpdateToTrackingEvents,
  transformMilestone,
  mapMilestoneStatus,
} from '../../../../../../../src/verticals/logistics/adapters/vizion-api/transform/tracking'
import type {
  VizionMilestone,
  VizionUpdateEvent,
  VizionPayload,
} from '../../../../../../../src/verticals/logistics/adapters/vizion-api/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeMilestone(overrides: Partial<VizionMilestone> = {}): VizionMilestone {
  return {
    timestamp: '2024-03-01T00:00:00Z',
    location: {
      name: 'Port of Shanghai',
      city: 'Shanghai',
      state: null,
      country: 'CN',
      unlocode: 'CNSHA',
    },
    description: 'Vessel departed',
    raw_description: 'VESSEL DEPARTED',
    planned: false,
    vessel: 'MV Acme Star',
    voyage: 'V042E',
    ...overrides,
  }
}

function makePayload(overrides: Partial<VizionPayload> = {}): VizionPayload {
  return {
    bill_of_lading: 'BL-2024-001',
    carrier_scac: 'MAEU',
    container_id: 'MSCU1234567',
    container_iso: '40HC',
    milestones: [makeMilestone()],
    ...overrides,
  }
}

function makeUpdateEvent(overrides: Partial<VizionUpdateEvent> = {}): VizionUpdateEvent {
  return {
    id: 'EVT-001',
    status: 'DATA_RECEIVED',
    reference_id: 'REF-VIZ-001',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    payload: makePayload(),
    ...overrides,
  }
}

// ─── mapMilestoneStatus ──────────────────────────────────────────────────────

describe('mapMilestoneStatus (vizion-api)', () => {
  it('returns IN_TRANSIT for "Vessel departed"', () => {
    expect(mapMilestoneStatus('Vessel departed', false)).toBe('IN_TRANSIT')
  })

  it('returns IN_TRANSIT for "Loaded onboard"', () => {
    expect(mapMilestoneStatus('Loaded onboard', false)).toBe('IN_TRANSIT')
  })

  it('returns DELIVERED for "Final Delivery"', () => {
    expect(mapMilestoneStatus('Final Delivery', false)).toBe('DELIVERED')
  })

  it('returns OUT_FOR_DELIVERY for "Gate-in"', () => {
    expect(mapMilestoneStatus('Gate-in', false)).toBe('OUT_FOR_DELIVERY')
  })

  it('returns PRE_TRANSIT for "Empty container"', () => {
    expect(mapMilestoneStatus('Empty container', false)).toBe('PRE_TRANSIT')
  })

  it('returns RETURN_TO_SENDER for "Return to sender"', () => {
    expect(mapMilestoneStatus('Return to sender', false)).toBe('RETURN_TO_SENDER')
  })

  it('returns FAILURE for "Exception"', () => {
    expect(mapMilestoneStatus('Exception', false)).toBe('FAILURE')
  })

  it('returns UNKNOWN for unrecognized description', () => {
    expect(mapMilestoneStatus('Unknown event xyz', false)).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for null description', () => {
    expect(mapMilestoneStatus(null, false)).toBe('UNKNOWN')
  })
})

// ─── transformMilestone ──────────────────────────────────────────────────────

describe('transformMilestone (vizion-api)', () => {
  it('maps trackingNumber from containerId', () => {
    const result = transformMilestone(makeMilestone(), 'MSCU1234567', 'REF-001', 'MAEU')
    expect(result.trackingNumber).toBe('MSCU1234567')
  })

  it('maps shipmentId from referenceId', () => {
    const result = transformMilestone(makeMilestone(), 'MSCU1234567', 'REF-001', 'MAEU')
    expect(result.shipmentId).toBe('REF-001')
  })

  it('maps carrierId from carrierId param', () => {
    const result = transformMilestone(makeMilestone(), 'MSCU1234567', 'REF-001', 'MAEU')
    expect(result.carrierId).toBe('MAEU')
  })

  it('falls back carrierId to "vizion-api" when null', () => {
    const result = transformMilestone(makeMilestone(), null, null, null)
    expect(result.carrierId).toBe('vizion-api')
  })

  it('maps description from milestone.description', () => {
    const result = transformMilestone(makeMilestone(), null, null, null)
    expect(result.description).toBe('Vessel departed')
  })

  it('falls back description to raw_description when description is absent', () => {
    const result = transformMilestone(makeMilestone({ description: null }), null, null, null)
    expect(result.description).toBe('VESSEL DEPARTED')
  })

  it('maps location.city from loc.city', () => {
    const result = transformMilestone(makeMilestone(), null, null, null)
    expect(result.location?.city).toBe('Shanghai')
  })

  it('maps location.country from loc.country', () => {
    const result = transformMilestone(makeMilestone(), null, null, null)
    expect(result.location?.country).toBe('CN')
  })

  it('maps location.postalCode from loc.unlocode', () => {
    const result = transformMilestone(makeMilestone(), null, null, null)
    expect(result.location?.postalCode).toBe('CNSHA')
  })

  it('maps occurredAt from milestone.timestamp as a Date', () => {
    const result = transformMilestone(makeMilestone(), null, null, null)
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('passes metadata through as raw milestone', () => {
    const raw = makeMilestone()
    expect(transformMilestone(raw, null, null, null).metadata).toBe(raw)
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    const result = transformMilestone(makeMilestone(), 'MSCU1234567', 'REF-001', 'MAEU')
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })
})

// ─── transformUpdateToTrackingEvents ────────────────────────────────────────

describe('transformUpdateToTrackingEvents (vizion-api)', () => {
  it('returns one event per milestone', () => {
    const events = transformUpdateToTrackingEvents(makeUpdateEvent())
    expect(events).toHaveLength(1)
  })

  it('maps trackingNumber from payload.container_id on each event', () => {
    const events = transformUpdateToTrackingEvents(makeUpdateEvent())
    expect(events[0].trackingNumber).toBe('MSCU1234567')
  })

  it('maps shipmentId from event.reference_id', () => {
    const events = transformUpdateToTrackingEvents(makeUpdateEvent())
    expect(events[0].shipmentId).toBe('REF-VIZ-001')
  })

  it('maps carrierId from payload.carrier_scac', () => {
    const events = transformUpdateToTrackingEvents(makeUpdateEvent())
    expect(events[0].carrierId).toBe('MAEU')
  })

  it('returns a single UNKNOWN event when milestones is empty', () => {
    const event = makeUpdateEvent({ payload: makePayload({ milestones: [] }) })
    const events = transformUpdateToTrackingEvents(event)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('maps multiple milestones to separate events', () => {
    const event = makeUpdateEvent({
      payload: makePayload({
        milestones: [
          makeMilestone({ description: 'Vessel departed' }),
          makeMilestone({ description: 'Vessel arrived', timestamp: '2024-03-15T00:00:00Z' }),
        ],
      }),
    })
    const events = transformUpdateToTrackingEvents(event)
    expect(events).toHaveLength(2)
    expect(events[0].status).toBe('IN_TRANSIT')
    expect(events[1].status).toBe('IN_TRANSIT')
  })

  it('passes TrackingEventSchema.parse on each event without throwing', () => {
    const events = transformUpdateToTrackingEvents(makeUpdateEvent())
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
