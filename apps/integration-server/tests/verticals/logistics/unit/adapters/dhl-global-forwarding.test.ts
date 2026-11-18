import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type DhlGfTrackingResponse,
  type DhlGfTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/dhl-global-forwarding/transform/tracking'
import {
  transformShipment,
  type DhlGfShipment,
} from '../../../../../src/verticals/logistics/adapters/dhl-global-forwarding/transform/shipment'

function makeTrackingEvent(overrides: Partial<DhlGfTrackingEvent> = {}): DhlGfTrackingEvent {
  return {
    timestamp: '2024-03-15T10:30:00Z',
    status: 'transit',
    statusCode: 'transit',
    description: 'In transit',
    location: { address: { addressLocality: 'Frankfurt', countryCode: 'DE', postalCode: '60311' } },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: { id?: string; events?: DhlGfTrackingEvent[]; status?: { statusCode?: string | null; status?: string | null } | null } = {}): DhlGfTrackingResponse {
  return {
    shipments: [
      {
        id: overrides.id ?? 'GFN12345',
        status: overrides.status ?? { statusCode: 'transit', status: 'transit' },
        events: overrides.events ?? [
          makeTrackingEvent({ statusCode: 'pre-transit', status: 'pre-transit', description: 'Pickup scheduled' }),
          makeTrackingEvent(),
        ],
      },
    ],
  }
}

function makeShipment(overrides: Partial<DhlGfShipment> = {}): DhlGfShipment {
  return {
    shipmentId: 'shp-gf-001',
    trackingNumber: 'GFN12345',
    status: 'transit',
    serviceCode: 'AIR_FREIGHT',
    weight: 120,
    weightUnit: 'kg',
    sender: { name: 'Ship', street1: 'Harbor 1', city: 'Rotterdam', postalCode: '3011', country: 'NL' },
    recipient: { name: 'Recv', street1: 'Port 99', city: 'Singapore', postalCode: '018989', country: 'SG' },
    reference: 'REF-GF-1',
    createdAt: '2024-03-10T08:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('DhlGlobalForwarding transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps fields to canonical event', () => {
    const e = transformTracking(makeTrackingResponse())[0]
    expect(e.trackingNumber).toBe('GFN12345')
    expect(e.carrierId).toBe('dhl-global-forwarding')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.description).toBe('Pickup scheduled')
    expect(e.location?.city).toBe('Frankfurt')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('passes metadata through', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits fallback event when events empty', () => {
    const r = transformTracking(makeTrackingResponse({ events: [], status: { statusCode: 'delivered', status: 'delivered' } }))
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('DELIVERED')
  })

  it('handles null location', () => {
    const r = transformTracking(makeTrackingResponse({ events: [makeTrackingEvent({ location: null })] }))
    expect(r[0].location).toBeUndefined()
  })

  it('maps all status codes', () => {
    const cases: [string, string][] = [
      ['pre-transit', 'PRE_TRANSIT'],
      ['transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['available_for_pickup', 'AVAILABLE_FOR_PICKUP'],
      ['return_to_sender', 'RETURN_TO_SENDER'],
      ['failure', 'FAILURE'],
      ['unknown', 'UNKNOWN'],
      ['weird', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const r = transformTracking(makeTrackingResponse({ events: [makeTrackingEvent({ statusCode: code, status: code })] }))
      expect(r[0].status).toBe(expected)
    }
  })

  it('handles multiple shipments', () => {
    const raw: DhlGfTrackingResponse = {
      shipments: [
        { id: 'A', events: [makeTrackingEvent()] },
        { id: 'B', events: [makeTrackingEvent({ statusCode: 'delivered', status: 'delivered' })] },
      ],
    }
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
    expect(events[1].status).toBe('DELIVERED')
  })
})

describe('DhlGlobalForwarding transformShipment', () => {
  it('maps canonical fields', () => {
    const s = transformShipment(makeShipment())
    expect(s.id).toBe('shp-gf-001')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.carrierId).toBe('dhl-global-forwarding')
    expect(s.serviceCode).toBe('AIR_FREIGHT')
  })

  it('maps addresses and weight', () => {
    const s = transformShipment(makeShipment())
    expect(s.originAddress?.city).toBe('Rotterdam')
    expect(s.destinationAddress?.city).toBe('Singapore')
    expect(s.totalWeight?.value).toBe(120)
  })

  it('passes metadata through', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing fields gracefully', () => {
    const s = transformShipment(makeShipment({
      weight: null, weightUnit: null, sender: null, recipient: null,
      serviceCode: null, status: null, reference: null, createdAt: null, updatedAt: null, trackingNumber: null,
    }))
    expect(s.totalWeight).toBeUndefined()
    expect(s.originAddress).toBeUndefined()
    expect(s.status).toBe('UNKNOWN')
  })

  it('maps statuses', () => {
    const cases: [string | null, string][] = [
      ['created', 'LABEL_CREATED'],
      ['delivered', 'DELIVERED'],
      ['exception', 'EXCEPTION'],
      ['returned', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })
})
