import { describe, it, expect } from 'vitest'
import { transformTrackingEvents, type EchoTrackingResponse, type EchoTrackingEvent } from '../../../../../src/verticals/logistics/adapters/echo/transform/tracking'
import { transformShipment, type EchoShipmentResponse } from '../../../../../src/verticals/logistics/adapters/echo/transform/shipment'
import { transformRate, type EchoRateResponse } from '../../../../../src/verticals/logistics/adapters/echo/transform/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateResponse(overrides: Partial<EchoRateResponse> = {}): EchoRateResponse {
  return {
    quoteId: 'QUO-001',
    serviceType: 'FTL',
    serviceName: 'Full Truckload',
    totalPrice: 2500.00,
    currency: 'USD',
    estimatedPickupDate: '2024-01-17T00:00:00Z',
    estimatedDeliveryDate: '2024-01-20T00:00:00Z',
    transitDays: 3,
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<EchoTrackingEvent> = {}): EchoTrackingEvent {
  return {
    timestamp: '2024-01-16T14:30:00Z',
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    location: {
      address: '123 Main St',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601',
      country: 'US',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<EchoTrackingResponse> = {}): EchoTrackingResponse {
  return {
    shipmentId: 'SHP-001',
    status: 'IN_TRANSIT',
    statusDescription: 'Shipment in transit',
    events: [makeTrackingEvent()],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<EchoShipmentResponse> = {}): EchoShipmentResponse {
  return {
    id: 'SHP-001',
    referenceNumber: 'REF-123456',
    serviceType: 'FTL',
    status: 'BOOKED',
    createdAt: '2024-01-16T10:00:00Z',
    totalWeight: {
      value: 15000,
      unit: 'LBS',
    },
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateResponse()
    const result = transformRate(raw)

    expect(result.id).toBe('QUO-001')
    expect(result.carrierId).toBe('echo')
    expect(result.serviceCode).toBe('FTL')
    expect(result.serviceName).toBe('Full Truckload')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(2500.00)
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

// ─── transformTrackingEvents ──────────────────────────────────────────────────

describe('transformTrackingEvents', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
  })

  it('maps event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTrackingEvents(raw)[0]

    expect(event.trackingNumber).toBe('SHP-001')
    expect(event.carrierId).toBe('echo')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Shipment in transit')
    expect(event.location?.street1).toBe('123 Main St')
    expect(event.location?.city).toBe('Chicago')
    expect(event.location?.state).toBe('IL')
    expect(event.location?.postalCode).toBe('60601')
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

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('REF-123456')
    expect(result.carrierId).toBe('echo')
    expect(result.serviceCode).toBe('FTL')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
