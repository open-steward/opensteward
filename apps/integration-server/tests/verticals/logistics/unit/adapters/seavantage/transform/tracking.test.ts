import { describe, it, expect } from 'vitest'
import {
  transformCargoTracking,
  transformVesselTracking,
  mapMilestoneStatus,
  type SeaVantageVesselInfo,
  type SeaVantageVesselPosition,
} from '../../../../../../../src/verticals/logistics/adapters/seavantage/transform/tracking'
import type { SeaVantageCargoResponse } from '../../../../../../../src/verticals/logistics/adapters/seavantage/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeCargo(overrides: Partial<SeaVantageCargoResponse> = {}): SeaVantageCargoResponse {
  return {
    shipment_id: 'SV-001',
    container_number: 'MSCU1234567',
    mbl_number: 'BL-2024-001',
    booking_number: 'BK-001',
    carrier: 'MAEU',
    status: 'ON_VESSEL',
    milestones: [
      {
        event: 'GATE_IN',
        actual_time: '2024-03-01T00:00:00Z',
        estimated_time: null,
        location: 'Shanghai',
        description: 'Container gate-in at origin',
      },
      {
        event: 'LOAD_ON_VESSEL',
        actual_time: '2024-03-02T00:00:00Z',
        estimated_time: null,
        location: 'Shanghai',
        description: 'Loaded on vessel',
      },
    ],
    ...overrides,
  }
}

function makeVesselInfo(overrides: Partial<SeaVantageVesselInfo> = {}): SeaVantageVesselInfo {
  return {
    imo: '9321483',
    mmsi: '636013736',
    name: 'MV OCEAN QUEEN',
    type: 'Container Ship',
    flag: 'US',
    position: {
      timestamp: '2024-03-01T00:00:00Z',
      speed_over_ground: 18.5,
      course_over_ground: 270,
      true_heading: 268,
      latitude: 35.6,
      longitude: 139.7,
      ais_destination: 'USLAX',
      ais_eta: '2024-03-20T00:00:00Z',
    },
    ...overrides,
  }
}

describe('seavantage mapMilestoneStatus', () => {
  it('maps GATE_IN → PRE_TRANSIT', () => {
    expect(mapMilestoneStatus('GATE_IN')).toBe('PRE_TRANSIT')
  })

  it('maps GATE-IN → PRE_TRANSIT', () => {
    expect(mapMilestoneStatus('GATE-IN')).toBe('PRE_TRANSIT')
  })

  it('maps EMPTY_RETURN → PRE_TRANSIT', () => {
    expect(mapMilestoneStatus('EMPTY_RETURN')).toBe('PRE_TRANSIT')
  })

  it('maps LOAD_ON_VESSEL → IN_TRANSIT', () => {
    expect(mapMilestoneStatus('LOAD_ON_VESSEL')).toBe('IN_TRANSIT')
  })

  it('maps DEPART → IN_TRANSIT', () => {
    expect(mapMilestoneStatus('DEPART')).toBe('IN_TRANSIT')
  })

  it('maps ON_VESSEL → IN_TRANSIT', () => {
    expect(mapMilestoneStatus('ON_VESSEL')).toBe('IN_TRANSIT')
  })

  it('maps ARRIV → IN_TRANSIT', () => {
    expect(mapMilestoneStatus('ARRIV')).toBe('IN_TRANSIT')
  })

  it('maps DISCHARG → IN_TRANSIT', () => {
    expect(mapMilestoneStatus('DISCHARG')).toBe('IN_TRANSIT')
  })

  it('maps GATE_OUT → OUT_FOR_DELIVERY', () => {
    expect(mapMilestoneStatus('GATE_OUT')).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DELIVER → DELIVERED', () => {
    expect(mapMilestoneStatus('DELIVER')).toBe('DELIVERED')
  })

  it('maps EXCEPTION → FAILURE', () => {
    expect(mapMilestoneStatus('EXCEPTION')).toBe('FAILURE')
  })

  it('maps FAIL → FAILURE', () => {
    expect(mapMilestoneStatus('FAIL')).toBe('FAILURE')
  })

  it('maps unknown → UNKNOWN', () => {
    expect(mapMilestoneStatus('XYZ')).toBe('UNKNOWN')
  })

  it('maps null → UNKNOWN', () => {
    expect(mapMilestoneStatus(null)).toBe('UNKNOWN')
  })
})

describe('seavantage transformCargoTracking', () => {
  it('produces one event per milestone', () => {
    const events = transformCargoTracking(makeCargo())
    expect(events).toHaveLength(2)
  })

  it('maps carrierId from cargo.carrier', () => {
    const [e] = transformCargoTracking(makeCargo())
    expect(e.carrierId).toBe('MAEU')
  })

  it('maps trackingNumber from container_number', () => {
    const [e] = transformCargoTracking(makeCargo())
    expect(e.trackingNumber).toBe('MSCU1234567')
  })

  it('maps status via mapMilestoneStatus for GATE_IN', () => {
    const [e] = transformCargoTracking(makeCargo())
    expect(e.status).toBe('PRE_TRANSIT')
  })

  it('maps status for LOAD_ON_VESSEL milestone', () => {
    const [, e2] = transformCargoTracking(makeCargo())
    expect(e2.status).toBe('IN_TRANSIT')
  })

  it('maps description from milestone description field', () => {
    const [e] = transformCargoTracking(makeCargo())
    expect(e.description).toBe('Container gate-in at origin')
  })

  it('maps location city from milestone location', () => {
    const [e] = transformCargoTracking(makeCargo())
    expect(e.location?.city).toBe('Shanghai')
  })

  it('maps occurredAt from actual_time', () => {
    const [e] = transformCargoTracking(makeCargo())
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to estimated_time when actual_time absent', () => {
    const cargo = makeCargo({
      milestones: [
        {
          event: 'GATE_IN',
          actual_time: null,
          estimated_time: '2024-03-01T00:00:00Z',
          location: 'Busan',
          description: null,
        },
      ],
    })
    const [e] = transformCargoTracking(cargo)
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('emits single UNKNOWN event when no milestones', () => {
    const events = transformCargoTracking(makeCargo({ milestones: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('fallback event uses seavantage as carrierId when carrier is absent', () => {
    const events = transformCargoTracking(makeCargo({ milestones: [], carrier: null }))
    expect(events[0].carrierId).toBe('seavantage')
  })

  it('preserves milestone as metadata', () => {
    const [e] = transformCargoTracking(makeCargo())
    expect(e.metadata).toBeDefined()
  })

  it('passes TrackingEventSchema validation for each event', () => {
    const events = transformCargoTracking(makeCargo())
    for (const e of events) {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    }
  })
})

describe('seavantage transformVesselTracking', () => {
  it('maps trackingNumber from imo as string', () => {
    expect(transformVesselTracking(makeVesselInfo()).trackingNumber).toBe('9321483')
  })

  it('sets carrierId to seavantage', () => {
    expect(transformVesselTracking(makeVesselInfo()).carrierId).toBe('seavantage')
  })

  it('sets status to IN_TRANSIT', () => {
    expect(transformVesselTracking(makeVesselInfo()).status).toBe('IN_TRANSIT')
  })

  it('maps description from vessel name', () => {
    expect(transformVesselTracking(makeVesselInfo()).description).toBe('MV OCEAN QUEEN')
  })

  it('maps location from ais_destination', () => {
    expect(transformVesselTracking(makeVesselInfo()).location?.city).toBe('USLAX')
  })

  it('maps occurredAt from position timestamp', () => {
    expect(transformVesselTracking(makeVesselInfo()).occurredAt).toBeInstanceOf(Date)
  })

  it('handles missing position gracefully', () => {
    const r = transformVesselTracking(makeVesselInfo({ position: null }))
    expect(r.location).toBeUndefined()
    expect(r.occurredAt).toBeUndefined()
  })

  it('maps numeric imo to string', () => {
    expect(transformVesselTracking(makeVesselInfo({ imo: 9321483 })).trackingNumber).toBe('9321483')
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformVesselTracking(makeVesselInfo())
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })
})
