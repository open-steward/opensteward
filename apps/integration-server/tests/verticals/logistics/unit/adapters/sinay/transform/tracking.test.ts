import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  mapTrackingStatus,
} from '../../../../../../../src/verticals/logistics/adapters/sinay/transform/tracking'
import type { SinayShipmentResponse } from '../../../../../../../src/verticals/logistics/adapters/sinay/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeShipment(overrides: Partial<SinayShipmentResponse> = {}): SinayShipmentResponse {
  return {
    shipmentNumber: 'MAEU123456789',
    sealine: 'MAEU',
    containers: [
      {
        number: 'MSCU1234567',
        events: [
          {
            eventCode: 'LOAD',
            eventType: 'LOAD',
            description: 'Loaded on vessel',
            date: '2024-03-01T00:00:00Z',
            location: { name: 'Shanghai', country: 'CN', locode: 'CNSHA' },
            status: null,
            isActual: true,
          },
          {
            eventCode: 'GATE_IN',
            eventType: 'GATE_IN',
            description: 'Gate in at destination terminal',
            date: '2024-03-15T00:00:00Z',
            location: { name: 'Los Angeles', country: 'US', locode: 'USLAX' },
            status: null,
            isActual: false,
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('Sinay mapTrackingStatus', () => {
  it('maps LOAD eventCode to IN_TRANSIT', () => {
    expect(mapTrackingStatus('LOAD', null, null)).toBe('IN_TRANSIT')
  })

  it('maps GATE_IN to OUT_FOR_DELIVERY', () => {
    expect(mapTrackingStatus('GATE_IN', null, null)).toBe('OUT_FOR_DELIVERY')
  })

  it('maps GATE_OUT to PRE_TRANSIT', () => {
    expect(mapTrackingStatus('GATE_OUT', null, null)).toBe('PRE_TRANSIT')
  })

  it('maps DELIV to DELIVERED', () => {
    expect(mapTrackingStatus('DELIVER', null, null)).toBe('DELIVERED')
  })

  it('maps GATE_OUT_DEST to DELIVERED', () => {
    expect(mapTrackingStatus('GATE_OUT_DEST', null, null)).toBe('DELIVERED')
  })

  it('maps EXCEPTION to FAILURE', () => {
    expect(mapTrackingStatus('EXCEPTION', null, null)).toBe('FAILURE')
  })

  it('returns UNKNOWN for unrecognised code', () => {
    expect(mapTrackingStatus('UNKNOWN_CODE', null, null)).toBe('UNKNOWN')
  })

  it('falls back to eventType when eventCode is null', () => {
    expect(mapTrackingStatus(null, 'ARRIV', null)).toBe('IN_TRANSIT')
  })

  it('falls back to status when both eventCode and eventType are null', () => {
    expect(mapTrackingStatus(null, null, 'IN_TRANSIT')).toBe('IN_TRANSIT')
  })
})

describe('Sinay transformTracking', () => {
  it('produces one event per container event', () => {
    const events = transformTracking(makeShipment())
    expect(events).toHaveLength(2)
  })

  it('maps carrierId to sinay', () => {
    const events = transformTracking(makeShipment())
    events.forEach((e) => expect(e.carrierId).toBe('sinay'))
  })

  it('maps trackingNumber from container number', () => {
    const events = transformTracking(makeShipment())
    events.forEach((e) => expect(e.trackingNumber).toBe('MSCU1234567'))
  })

  it('maps LOAD event to IN_TRANSIT status', () => {
    const events = transformTracking(makeShipment())
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps location name to city and locode to postalCode', () => {
    const events = transformTracking(makeShipment())
    expect(events[0].location?.city).toBe('Shanghai')
    expect(events[0].location?.country).toBe('CN')
    expect(events[0].location?.postalCode).toBe('CNSHA')
  })

  it('maps description from event description', () => {
    const events = transformTracking(makeShipment())
    expect(events[0].description).toBe('Loaded on vessel')
  })

  it('maps occurredAt as Date from event date', () => {
    const events = transformTracking(makeShipment())
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('sorts events chronologically (earliest first)', () => {
    const events = transformTracking(makeShipment())
    const t0 = events[0].occurredAt!.getTime()
    const t1 = events[1].occurredAt!.getTime()
    expect(t0).toBeLessThan(t1)
  })

  it('passes TrackingEventSchema validation for each event', () => {
    const events = transformTracking(makeShipment())
    events.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })

  it('emits single UNKNOWN stub when containers array is empty', () => {
    const events = transformTracking(makeShipment({ containers: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('MAEU123456789')
  })

  it('emits single UNKNOWN stub when container has no events', () => {
    const events = transformTracking(
      makeShipment({ containers: [{ number: 'MSCU0000001', events: [] }] }),
    )
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('flattens events across multiple containers', () => {
    const raw = makeShipment()
    raw.containers = [
      {
        number: 'BOX001',
        events: [{ eventCode: 'LOAD', date: '2024-03-01T00:00:00Z', description: 'Loaded' }],
      },
      {
        number: 'BOX002',
        events: [{ eventCode: 'ARRIV', date: '2024-03-10T00:00:00Z', description: 'Arrived' }],
      },
    ]
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
    expect(events.some((e) => e.trackingNumber === 'BOX001')).toBe(true)
    expect(events.some((e) => e.trackingNumber === 'BOX002')).toBe(true)
  })
})
