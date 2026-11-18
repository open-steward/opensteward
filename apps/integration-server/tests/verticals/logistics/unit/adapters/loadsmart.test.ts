import { describe, it, expect } from 'vitest'
import { transformTrackingEvents, type LoadsmartTrackingResponse, type LoadsmartTrackingEvent } from '../../../../../src/verticals/logistics/adapters/loadsmart/transform/tracking'
import { transformShipment, type LoadsmartShipmentResponse } from '../../../../../src/verticals/logistics/adapters/loadsmart/transform/shipment'
import { transformRate, type LoadsmartRateResponse } from '../../../../../src/verticals/logistics/adapters/loadsmart/transform/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateResponse(overrides: Partial<LoadsmartRateResponse> = {}): LoadsmartRateResponse {
  return {
    quoteId: 'QUO-LS-001',
    serviceType: 'LTL',
    serviceName: 'Less Than Truckload',
    totalPrice: 1800.00,
    currency: 'USD',
    estimatedPickupDate: '2024-01-17T00:00:00Z',
    estimatedDeliveryDate: '2024-01-21T00:00:00Z',
    transitDays: 4,
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<LoadsmartTrackingEvent> = {}): LoadsmartTrackingEvent {
  return {
    timestamp: '2024-01-16T14:30:00Z',
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    location: {
      address: '789 Logistics Way',
      city: 'Atlanta',
      state: 'GA',
      zipCode: '30301',
      country: 'US',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<LoadsmartTrackingResponse> = {}): LoadsmartTrackingResponse {
  return {
    shipmentId: 'SHP-LS-001',
    status: 'IN_TRANSIT',
    statusDescription: 'Shipment in transit',
    events: [makeTrackingEvent()],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<LoadsmartShipmentResponse> = {}): LoadsmartShipmentResponse {
  return {
    id: 'SHP-LS-001',
    referenceNumber: 'REF-LS-123456',
    serviceType: 'LTL',
    status: 'BOOKED',
    createdAt: '2024-01-16T10:00:00Z',
    totalWeight: {
      value: 8000,
      unit: 'LBS',
    },
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('Loadsmart transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateResponse()
    const result = transformRate(raw)

    expect(result.id).toBe('QUO-LS-001')
    expect(result.carrierId).toBe('loadsmart')
    expect(result.serviceCode).toBe('LTL')
    expect(result.serviceName).toBe('Less Than Truckload')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(1800.00)
    expect(result.transitDays).toBe(4)
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

describe('Loadsmart transformTrackingEvents', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
  })

  it('maps event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTrackingEvents(raw)[0]

    expect(event.trackingNumber).toBe('SHP-LS-001')
    expect(event.carrierId).toBe('loadsmart')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Shipment in transit')
    expect(event.location?.street1).toBe('789 Logistics Way')
    expect(event.location?.city).toBe('Atlanta')
    expect(event.location?.state).toBe('GA')
    expect(event.location?.postalCode).toBe('30301')
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

  it('maps PICKED_UP to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'PICKED_UP' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps ARRIVING to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'ARRIVING' })] })
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

describe('Loadsmart transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-LS-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('REF-LS-123456')
    expect(result.carrierId).toBe('loadsmart')
    expect(result.serviceCode).toBe('LTL')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
