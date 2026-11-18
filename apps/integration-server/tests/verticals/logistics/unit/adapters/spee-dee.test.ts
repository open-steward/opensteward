import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type SpeeDeeTrackingResponse,
  type SpeeDeeTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/spee-dee/transform/tracking'
import {
  transformShipment,
  type SpeeDeeShipmentResponse,
} from '../../../../../src/verticals/logistics/adapters/spee-dee/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<SpeeDeeTrackingEvent> = {}): SpeeDeeTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Package in transit',
    timestamp: '2024-08-01T10:00:00Z',
    city: 'Minneapolis',
    state: 'MN',
    zip: '55401',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<SpeeDeeTrackingResponse> = {}): SpeeDeeTrackingResponse {
  return {
    trackingNumber: 'SD1234567890',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'PICKED_UP', description: 'Picked up', city: 'Chicago', state: 'IL' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<SpeeDeeShipmentResponse> = {}): SpeeDeeShipmentResponse {
  return {
    shipmentId: 'SHP-SD-001',
    trackingNumber: 'SD1234567890',
    status: 'IN_TRANSIT',
    serviceCode: 'GROUND',
    origin: {
      name: 'John Sender',
      company: 'Sender Corp',
      street1: '100 Lake St',
      street2: null,
      city: 'Chicago',
      state: 'IL',
      postalCode: '60601',
      country: 'US',
      phone: '+13125551234',
      email: 'john@sender.com',
    },
    destination: {
      name: 'Jane Receiver',
      company: 'Receiver Inc',
      street1: '200 Nicollet Mall',
      street2: null,
      city: 'Minneapolis',
      state: 'MN',
      postalCode: '55401',
      country: 'US',
      phone: '+16125551234',
      email: 'jane@receiver.com',
    },
    packages: [
      { trackingNumber: 'SD1234567890', weight: 3.0, length: 10, width: 8, height: 4 },
    ],
    totalWeight: 3.0,
    reference: 'REF-SD-001',
    createdAt: '2024-08-01T08:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Spee-Dee transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('SD1234567890')
    expect(event.carrierId).toBe('spee-dee')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Picked up')
    expect(event.location?.city).toBe('Chicago')
    expect(event.location?.state).toBe('IL')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const events = transformTracking(makeTrackingResponse({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles null city gracefully', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ city: null })] })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['PICKED_UP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['OTHER', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Spee-Dee transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-SD-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('SD1234567890')
    expect(result.carrierId).toBe('spee-dee')
    expect(result.serviceCode).toBe('GROUND')
    expect(result.reference).toBe('REF-SD-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipmentResponse())

    expect(result.originAddress?.name).toBe('John Sender')
    expect(result.originAddress?.city).toBe('Chicago')
    expect(result.destinationAddress?.name).toBe('Jane Receiver')
    expect(result.destinationAddress?.city).toBe('Minneapolis')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipmentResponse({
      shipmentId: null,
      trackingNumber: null,
      status: null,
      serviceCode: null,
      origin: null,
      destination: null,
      packages: null,
      totalWeight: null,
      reference: null,
      createdAt: null,
    })
    const result = transformShipment(raw)

    expect(result.trackingNumber).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['CREATED', 'PENDING'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['OTHER', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipmentResponse({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
