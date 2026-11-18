import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type PickrrTrackingResponse,
  type PickrrTrackingActivity,
} from '../../../../../../../src/verticals/logistics/adapters/pickrr/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeActivity(overrides: Partial<PickrrTrackingActivity> = {}): PickrrTrackingActivity {
  return {
    status: 'in_transit',
    activity: 'Shipment in transit',
    location: 'Mumbai Hub',
    city: 'Mumbai',
    state: 'Maharashtra',
    timestamp: '2024-03-01T00:00:00Z',
    date_time: null,
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<PickrrTrackingResponse> = {},
): PickrrTrackingResponse {
  return {
    success: true,
    tracking_id: 'PCKR-TRK-001',
    courier: 'Delhivery',
    current_status: 'in_transit',
    scan_details: [
      makeActivity({
        status: 'booked',
        activity: 'Shipment booked',
        timestamp: '2024-03-01T00:00:00Z',
      }),
      makeActivity(),
    ],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pickrr transformTracking', () => {
  it('produces one event per scan_details entry', () => {
    expect(transformTracking(makeTrackingResponse(), 'PCKR-TRK-001')).toHaveLength(2)
  })

  it('generates sequential ids as trackingNumber-index', () => {
    const events = transformTracking(makeTrackingResponse(), 'PCKR-TRK-001')
    expect(events[0].id).toBe('PCKR-TRK-001-0')
    expect(events[1].id).toBe('PCKR-TRK-001-1')
  })

  it('maps shipmentId from trackingNumber argument', () => {
    const e = transformTracking(makeTrackingResponse(), 'PCKR-TRK-001')[0]
    expect(e.shipmentId).toBe('PCKR-TRK-001')
  })

  it('maps trackingNumber from raw.tracking_id', () => {
    const e = transformTracking(makeTrackingResponse(), 'PCKR-TRK-001')[0]
    expect(e.trackingNumber).toBe('PCKR-TRK-001')
  })

  it('falls back trackingNumber to argument when tracking_id is null', () => {
    const raw = makeTrackingResponse({ tracking_id: null })
    const e = transformTracking(raw, 'FALLBACK-TRK')[0]
    expect(e.trackingNumber).toBe('FALLBACK-TRK')
  })

  it('maps carrierId from courier', () => {
    expect(transformTracking(makeTrackingResponse(), 'PCKR-TRK-001')[0].carrierId).toBe('Delhivery')
  })

  it('maps booked status to PRE_TRANSIT', () => {
    expect(transformTracking(makeTrackingResponse(), 'PCKR-TRK-001')[0].status).toBe('PRE_TRANSIT')
  })

  it('maps in_transit status to IN_TRANSIT', () => {
    expect(transformTracking(makeTrackingResponse(), 'PCKR-TRK-001')[1].status).toBe('IN_TRANSIT')
  })

  it('maps delivered status to DELIVERED', () => {
    const raw = makeTrackingResponse({ scan_details: [makeActivity({ status: 'delivered' })] })
    expect(transformTracking(raw, 'TRK')[0].status).toBe('DELIVERED')
  })

  it('maps out_for_delivery status to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({
      scan_details: [makeActivity({ status: 'out_for_delivery' })],
    })
    expect(transformTracking(raw, 'TRK')[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps rto status to RETURN_TO_SENDER', () => {
    const raw = makeTrackingResponse({ scan_details: [makeActivity({ status: 'rto in transit' })] })
    expect(transformTracking(raw, 'TRK')[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps ndr/exception status to FAILURE', () => {
    const raw = makeTrackingResponse({
      scan_details: [makeActivity({ status: 'ndr attempt failed' })],
    })
    expect(transformTracking(raw, 'TRK')[0].status).toBe('FAILURE')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeTrackingResponse({ scan_details: [makeActivity({ status: null })] })
    expect(transformTracking(raw, 'TRK')[0].status).toBe('UNKNOWN')
  })

  it('maps description from activity field', () => {
    expect(transformTracking(makeTrackingResponse(), 'TRK')[0].description).toBe('Shipment booked')
  })

  it('maps location.city from city field', () => {
    const e = transformTracking(makeTrackingResponse(), 'TRK')[1]
    expect(e.location?.city).toBe('Mumbai')
  })

  it('falls back location.city to location string when city is null', () => {
    const raw = makeTrackingResponse({
      scan_details: [makeActivity({ city: null, location: 'Pune Depot' })],
    })
    const e = transformTracking(raw, 'TRK')[0]
    expect(e.location?.city).toBe('Pune Depot')
  })

  it('omits location when both city and location are null', () => {
    const raw = makeTrackingResponse({
      scan_details: [makeActivity({ city: null, location: null })],
    })
    expect(transformTracking(raw, 'TRK')[0].location).toBeUndefined()
  })

  it('maps occurredAt from timestamp', () => {
    const e = transformTracking(makeTrackingResponse(), 'TRK')[0]
    expect(e.occurredAt).toBeInstanceOf(Date)
    expect(e.occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back occurredAt to date_time when timestamp is null', () => {
    const raw = makeTrackingResponse({
      scan_details: [makeActivity({ timestamp: null, date_time: '2024-03-01T00:00:00Z' })],
    })
    expect(transformTracking(raw, 'TRK')[0].occurredAt).toBeInstanceOf(Date)
  })

  it('passes metadata as the activity object', () => {
    const activity = makeActivity()
    const raw = makeTrackingResponse({ scan_details: [activity] })
    expect(transformTracking(raw, 'TRK')[0].metadata).toBe(activity)
  })

  it('returns empty array when scan_details is null', () => {
    const raw = makeTrackingResponse({ scan_details: null })
    expect(transformTracking(raw, 'TRK')).toHaveLength(0)
  })

  it('each event passes TrackingEventSchema validation', () => {
    transformTracking(makeTrackingResponse(), 'PCKR-TRK-001').forEach((e) => {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    })
  })
})
