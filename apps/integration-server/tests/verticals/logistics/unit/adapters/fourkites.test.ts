import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type FourKitesTracking,
  type FourKitesTrackingStop,
} from '../../../../../src/verticals/logistics/adapters/fourkites/transform/tracking'
import {
  transformShipment,
  type FourKitesLoad,
} from '../../../../../src/verticals/logistics/adapters/fourkites/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeStop(overrides: Partial<FourKitesTrackingStop> = {}): FourKitesTrackingStop {
  return {
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: {
      city: 'Chicago',
      state: 'IL',
      country: 'US',
    },
    ...overrides,
  }
}

function makeTracking(overrides: Partial<FourKitesTracking> = {}): FourKitesTracking {
  return {
    loadId: 'LOAD-001',
    carrierName: 'ABC Freight',
    currentStatus: 'IN_TRANSIT',
    stops: [
      makeStop({ status: 'PICKED_UP', description: 'Picked up from shipper', location: { city: 'Los Angeles', state: 'CA', country: 'US' } }),
      makeStop(),
    ],
    estimatedDeliveryDate: '2024-03-18T12:00:00Z',
    ...overrides,
  }
}

function makeLoad(overrides: Partial<FourKitesLoad> = {}): FourKitesLoad {
  return {
    loadId: 'LOAD-001',
    status: 'IN_TRANSIT',
    trackingNumber: 'TRK-ABC-123',
    carrierName: 'ABC Freight',
    mode: 'TL',
    originCity: 'Los Angeles',
    originState: 'CA',
    originCountry: 'US',
    destinationCity: 'New York',
    destinationState: 'NY',
    destinationCountry: 'US',
    estimatedDeliveryDate: '2024-03-18T12:00:00Z',
    createdAt: '2024-03-14T10:00:00Z',
    updatedAt: '2024-03-15T14:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per stop', () => {
    const raw = makeTracking()
    expect(transformTracking(raw)).toHaveLength(2)
  })

  it('maps stop fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('LOAD-001')
    expect(event.carrierId).toBe('fourkites')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Picked up from shipper')
    expect(event.location?.city).toBe('Los Angeles')
    expect(event.location?.state).toBe('CA')
    expect(event.location?.country).toBe('US')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTracking()
    transformTracking(raw).forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits summary when stops is empty', () => {
    const raw = makeTracking({ stops: [] })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('emits UNKNOWN when stops empty and no currentStatus', () => {
    const raw = makeTracking({ stops: [], currentStatus: null })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles null location gracefully', () => {
    const raw = makeTracking({
      stops: [makeStop({ location: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['DISPATCHED', 'PRE_TRANSIT'],
      ['PICKED_UP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_STOP', 'IN_TRANSIT'],
      ['DELIVERED', 'DELIVERED'],
      ['DELAYED', 'FAILURE'],
      ['CANCELLED', 'FAILURE'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTracking({
        stops: [makeStop({ status })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeLoad()
    const result = transformShipment(raw)

    expect(result.id).toBe('LOAD-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('TRK-ABC-123')
    expect(result.carrierId).toBe('ABC Freight')
    expect(result.serviceCode).toBe('TL')
    expect(result.originAddress?.city).toBe('Los Angeles')
    expect(result.originAddress?.state).toBe('CA')
    expect(result.destinationAddress?.city).toBe('New York')
    expect(result.destinationAddress?.state).toBe('NY')
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeLoad()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('uses fourkites as carrierId when carrierName is missing', () => {
    const raw = makeLoad({ carrierName: null })
    expect(transformShipment(raw).carrierId).toBe('fourkites')
  })

  it('uses loadId as trackingNumber when trackingNumber is missing', () => {
    const raw = makeLoad({ trackingNumber: null })
    expect(transformShipment(raw).trackingNumber).toBe('LOAD-001')
  })

  it('handles missing origin/destination', () => {
    const raw = makeLoad({
      originCity: null,
      originState: null,
      originCountry: null,
      destinationCity: null,
      destinationState: null,
      destinationCountry: null,
    })
    const result = transformShipment(raw)
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeLoad({
      status: null,
      trackingNumber: null,
      carrierName: null,
      mode: null,
      originCity: null,
      originState: null,
      originCountry: null,
      destinationCity: null,
      destinationState: null,
      destinationCountry: null,
      estimatedDeliveryDate: null,
      createdAt: null,
      updatedAt: null,
    })
    const result = transformShipment(raw)

    expect(result.status).toBe('UNKNOWN')
    expect(result.serviceCode).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['DISPATCHED', 'PENDING'],
      ['PICKED_UP', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_STOP', 'IN_TRANSIT'],
      ['DELIVERED', 'DELIVERED'],
      ['DELAYED', 'EXCEPTION'],
      ['CANCELLED', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeLoad({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
