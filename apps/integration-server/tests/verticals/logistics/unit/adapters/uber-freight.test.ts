import { describe, it, expect } from 'vitest'
import { transformTrackingEvents, type UberFreightTrackingResponse, type UberFreightTrackingEvent } from '../../../../../src/verticals/logistics/adapters/uber-freight/transform/tracking'
import { transformShipment, type UberFreightShipmentResponse } from '../../../../../src/verticals/logistics/adapters/uber-freight/transform/shipment'
import { transformRate, type UberFreightRateResponse } from '../../../../../src/verticals/logistics/adapters/uber-freight/transform/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateResponse(overrides: Partial<UberFreightRateResponse> = {}): UberFreightRateResponse {
  return {
    quoteId: 'QUO-UF-001',
    serviceType: 'FTL',
    serviceName: 'Full Truckload',
    totalPrice: 3200.00,
    currency: 'USD',
    estimatedPickupDate: '2024-01-17T00:00:00Z',
    estimatedDeliveryDate: '2024-01-20T00:00:00Z',
    transitDays: 3,
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<UberFreightTrackingEvent> = {}): UberFreightTrackingEvent {
  return {
    timestamp: '2024-01-16T14:30:00Z',
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    location: {
      address: '456 Warehouse Blvd',
      city: 'Dallas',
      state: 'TX',
      zipCode: '75201',
      country: 'US',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<UberFreightTrackingResponse> = {}): UberFreightTrackingResponse {
  return {
    shipmentId: 'SHP-UF-001',
    status: 'IN_TRANSIT',
    statusDescription: 'Shipment in transit',
    events: [makeTrackingEvent()],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<UberFreightShipmentResponse> = {}): UberFreightShipmentResponse {
  return {
    id: 'SHP-UF-001',
    referenceNumber: 'REF-UF-123456',
    serviceType: 'FTL',
    status: 'BOOKED',
    createdAt: '2024-01-16T10:00:00Z',
    totalWeight: {
      value: 20000,
      unit: 'LBS',
    },
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('Uber Freight transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateResponse()
    const result = transformRate(raw)

    expect(result.id).toBe('QUO-UF-001')
    expect(result.carrierId).toBe('uber-freight')
    expect(result.serviceCode).toBe('FTL')
    expect(result.serviceName).toBe('Full Truckload')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(3200.00)
    expect(result.transitDays).toBe(3)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateResponse()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing delivery date', () => {
    const raw = makeRateResponse({ estimatedDeliveryDate: undefined })
    expect(transformRate(raw).estimatedDeliveryAt).toBeUndefined()
  })

  it('defaults currency to USD', () => {
    const raw = makeRateResponse({ currency: undefined })
    expect(transformRate(raw).currency).toBe('USD')
  })
})

// ─── transformTrackingEvents ────────────────────────────────────────────────

describe('Uber Freight transformTrackingEvents', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
  })

  it('maps event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTrackingEvents(raw)[0]

    expect(event.trackingNumber).toBe('SHP-UF-001')
    expect(event.carrierId).toBe('uber-freight')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Shipment in transit')
    expect(event.location?.street1).toBe('456 Warehouse Blvd')
    expect(event.location?.city).toBe('Dallas')
    expect(event.location?.state).toBe('TX')
    expect(event.location?.postalCode).toBe('75201')
    expect(event.location?.country).toBe('US')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTrackingResponse()
    const events = transformTrackingEvents(raw)
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single summary event when events is empty', () => {
    const raw = makeTrackingResponse({ events: [] })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps BOOKED to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'BOOKED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps DISPATCHED to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'DISPATCHED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps AT_DELIVERY to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'AT_DELIVERY' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DELIVERED to DELIVERED', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'DELIVERED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps CANCELLED to FAILURE', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'CANCELLED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'ZZ_UNKNOWN' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
  })

  it('handles missing location gracefully', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ location: undefined })] })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('Uber Freight transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-UF-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('REF-UF-123456')
    expect(result.carrierId).toBe('uber-freight')
    expect(result.serviceCode).toBe('FTL')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
