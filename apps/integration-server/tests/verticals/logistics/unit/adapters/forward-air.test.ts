import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ForwardAirTrackingResponse,
  type ForwardAirTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/forward-air/transform/tracking'
import {
  transformShipment,
  type ForwardAirShipmentResponse,
} from '../../../../../src/verticals/logistics/adapters/forward-air/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<ForwardAirTrackingEvent> = {}): ForwardAirTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    timestamp: '2024-08-01T10:00:00Z',
    terminal: 'DFW',
    city: 'Dallas',
    state: 'TX',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<ForwardAirTrackingResponse> = {}): ForwardAirTrackingResponse {
  return {
    trackingNumber: 'FA1234567890',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'RECEIVED', description: 'Shipment received', city: 'Memphis', state: 'TN' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<ForwardAirShipmentResponse> = {}): ForwardAirShipmentResponse {
  return {
    shipmentId: 'SHP-FA-001',
    trackingNumber: 'FA1234567890',
    status: 'IN_TRANSIT',
    serviceCode: 'EXPEDITED',
    origin: {
      name: 'John Sender',
      company: 'Sender Corp',
      street1: '100 Warehouse Blvd',
      street2: null,
      city: 'Memphis',
      state: 'TN',
      postalCode: '38101',
      country: 'US',
      phone: '+19015551234',
      email: 'john@sender.com',
    },
    destination: {
      name: 'Jane Receiver',
      company: 'Receiver Inc',
      street1: '200 Commerce Dr',
      street2: 'Dock 3',
      city: 'Dallas',
      state: 'TX',
      postalCode: '75201',
      country: 'US',
      phone: '+12145551234',
      email: 'jane@receiver.com',
    },
    packages: [
      { trackingNumber: 'FA1234567890', weight: 150.0, length: 48, width: 40, height: 36 },
    ],
    totalWeight: 150.0,
    reference: 'REF-FA-001',
    createdAt: '2024-08-01T08:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Forward Air transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('FA1234567890')
    expect(event.carrierId).toBe('forward-air')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment received')
    expect(event.location?.city).toBe('Memphis')
    expect(event.location?.state).toBe('TN')
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
      ['RECEIVED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_TERMINAL', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'FAILURE'],
      ['OTHER', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Forward Air transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-FA-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('FA1234567890')
    expect(result.carrierId).toBe('forward-air')
    expect(result.serviceCode).toBe('EXPEDITED')
    expect(result.reference).toBe('REF-FA-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipmentResponse())

    expect(result.originAddress?.name).toBe('John Sender')
    expect(result.originAddress?.city).toBe('Memphis')
    expect(result.destinationAddress?.name).toBe('Jane Receiver')
    expect(result.destinationAddress?.city).toBe('Dallas')
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
      ['RECEIVED', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_TERMINAL', 'IN_TRANSIT'],
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
