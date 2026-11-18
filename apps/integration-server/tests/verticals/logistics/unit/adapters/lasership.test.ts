import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type LaserShipTrackingResponse,
  type LaserShipTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/lasership/transform/tracking'
import {
  transformShipment,
  type LaserShipShipmentResponse,
} from '../../../../../src/verticals/logistics/adapters/lasership/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<LaserShipTrackingEvent> = {}): LaserShipTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Package in transit',
    timestamp: '2024-08-01T10:00:00Z',
    location: 'Newark Hub',
    city: 'Newark',
    state: 'NJ',
    zip: '07101',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<LaserShipTrackingResponse> = {}): LaserShipTrackingResponse {
  return {
    trackingNumber: 'LS1234567890',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'PICKED_UP', description: 'Picked up', city: 'New York', state: 'NY' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<LaserShipShipmentResponse> = {}): LaserShipShipmentResponse {
  return {
    shipmentId: 'SHP-LS-001',
    trackingNumber: 'LS1234567890',
    status: 'IN_TRANSIT',
    serviceCode: 'NEXT_DAY',
    origin: {
      name: 'John Sender',
      company: 'Sender Corp',
      street1: '100 Main St',
      street2: null,
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
      phone: '+12125551234',
      email: 'john@sender.com',
    },
    destination: {
      name: 'Jane Receiver',
      company: 'Receiver Inc',
      street1: '200 Elm St',
      street2: 'Suite 5',
      city: 'Newark',
      state: 'NJ',
      postalCode: '07101',
      country: 'US',
      phone: '+19735551234',
      email: 'jane@receiver.com',
    },
    packages: [
      { trackingNumber: 'LS1234567890', weight: 5.0, length: 12, width: 8, height: 6 },
    ],
    totalWeight: 5.0,
    reference: 'REF-LS-001',
    createdAt: '2024-08-01T08:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('LaserShip transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('LS1234567890')
    expect(event.carrierId).toBe('lasership')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Picked up')
    expect(event.location?.city).toBe('New York')
    expect(event.location?.state).toBe('NY')
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

describe('LaserShip transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-LS-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('LS1234567890')
    expect(result.carrierId).toBe('lasership')
    expect(result.serviceCode).toBe('NEXT_DAY')
    expect(result.reference).toBe('REF-LS-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipmentResponse())

    expect(result.originAddress?.name).toBe('John Sender')
    expect(result.originAddress?.city).toBe('New York')
    expect(result.destinationAddress?.name).toBe('Jane Receiver')
    expect(result.destinationAddress?.city).toBe('Newark')
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
