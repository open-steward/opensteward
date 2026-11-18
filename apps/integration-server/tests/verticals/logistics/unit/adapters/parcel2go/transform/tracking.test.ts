import { describe, it, expect } from 'vitest'
import {
  transformTrackingResult,
  type Parcel2GoTrackingResult,
  type Parcel2GoTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/parcel2go/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTrackingEvent(
  overrides: Partial<Parcel2GoTrackingEvent> = {},
): Parcel2GoTrackingEvent {
  return {
    Description: 'Parcel in transit',
    StatusCode: 'in_transit',
    DateTime: '2024-03-01T00:00:00Z',
    Location: 'Birmingham Hub',
    ...overrides,
  }
}

function makeTrackingResult(
  overrides: Partial<Parcel2GoTrackingResult> = {},
): Parcel2GoTrackingResult {
  return {
    TrackingNumber: 'TRK-P2G-001',
    CourierName: 'Evri',
    TrackingUrl: 'https://track.parcel2go.com/TRK-P2G-001',
    Results: [makeTrackingEvent()],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parcel2go transformTrackingResult', () => {
  it('produces one event per Results entry', () => {
    const raw = makeTrackingResult({ Results: [makeTrackingEvent(), makeTrackingEvent()] })
    expect(transformTrackingResult(raw, 'OL-001')).toHaveLength(2)
  })

  it('maps shipmentId from orderLineId argument', () => {
    const e = transformTrackingResult(makeTrackingResult(), 'OL-001')[0]
    expect(e.shipmentId).toBe('OL-001')
  })

  it('maps trackingNumber from TrackingNumber', () => {
    const e = transformTrackingResult(makeTrackingResult(), 'OL-001')[0]
    expect(e.trackingNumber).toBe('TRK-P2G-001')
  })

  it('maps carrierId from CourierName', () => {
    const e = transformTrackingResult(makeTrackingResult(), 'OL-001')[0]
    expect(e.carrierId).toBe('Evri')
  })

  it('maps IN_TRANSIT status via lowercase StatusCode', () => {
    const e = transformTrackingResult(makeTrackingResult(), 'OL-001')[0]
    expect(e.status).toBe('IN_TRANSIT')
  })

  it('maps delivered status', () => {
    const e = transformTrackingResult(
      makeTrackingResult({ Results: [makeTrackingEvent({ StatusCode: 'delivered' })] }),
      'OL-001',
    )[0]
    expect(e.status).toBe('DELIVERED')
  })

  it('maps pre_transit for label/booked codes', () => {
    const e = transformTrackingResult(
      makeTrackingResult({ Results: [makeTrackingEvent({ StatusCode: 'label_created' })] }),
      'OL-001',
    )[0]
    expect(e.status).toBe('PRE_TRANSIT')
  })

  it('maps return code to RETURN_TO_SENDER', () => {
    const e = transformTrackingResult(
      makeTrackingResult({ Results: [makeTrackingEvent({ StatusCode: 'return' })] }),
      'OL-001',
    )[0]
    expect(e.status).toBe('RETURN_TO_SENDER')
  })

  it('maps description from Description', () => {
    const e = transformTrackingResult(makeTrackingResult(), 'OL-001')[0]
    expect(e.description).toBe('Parcel in transit')
  })

  it('maps location.city from Location string', () => {
    const e = transformTrackingResult(makeTrackingResult(), 'OL-001')[0]
    expect(e.location?.city).toBe('Birmingham Hub')
  })

  it('parses DateTime as occurredAt Date', () => {
    const e = transformTrackingResult(makeTrackingResult(), 'OL-001')[0]
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('synthesises a fallback UNKNOWN event when Results is empty', () => {
    const events = transformTrackingResult(makeTrackingResult({ Results: [] }), 'OL-001')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('passes metadata as the raw tracking result object', () => {
    const raw = makeTrackingResult()
    expect(transformTrackingResult(raw, 'OL-001')[0].metadata).toBe(raw)
  })

  it('each event passes TrackingEventSchema validation', () => {
    transformTrackingResult(makeTrackingResult(), 'OL-001').forEach((e) => {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    })
  })
})
