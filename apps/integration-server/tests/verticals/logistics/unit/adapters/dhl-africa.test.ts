import { describe, it, expect } from 'vitest'
import { transformTrackingEvents, type DhlAfricaTrackingResponse, type DhlAfricaTrackingEvent } from '../../../../../src/verticals/logistics/adapters/dhl-africa/transform/tracking'
import { transformShipment, type DhlAfricaShipmentResponse } from '../../../../../src/verticals/logistics/adapters/dhl-africa/transform/shipment'
import { transformRate, type DhlAfricaRateResponse } from '../../../../../src/verticals/logistics/adapters/dhl-africa/transform/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateResponse(overrides: Partial<DhlAfricaRateResponse> = {}): DhlAfricaRateResponse {
  return {
    rateId: 'RATE-001',
    serviceType: 'EXPRESS',
    serviceName: 'DHL Express Africa',
    totalPrice: 45.50,
    currency: 'USD',
    estimatedDeliveryDate: '2024-03-20T00:00:00Z',
    transitDays: 5,
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<DhlAfricaTrackingEvent> = {}): DhlAfricaTrackingEvent {
  return {
    timestamp: '2024-03-16T14:30:00Z',
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    location: {
      address: '10 Commissioner St',
      city: 'Johannesburg',
      state: 'Gauteng',
      postalCode: '2001',
      country: 'ZA',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<DhlAfricaTrackingResponse> = {}): DhlAfricaTrackingResponse {
  return {
    trackingNumber: 'DHL-AF-001',
    status: 'IN_TRANSIT',
    statusDescription: 'Shipment in transit',
    events: [makeTrackingEvent()],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<DhlAfricaShipmentResponse> = {}): DhlAfricaShipmentResponse {
  return {
    id: 'SHP-AF-001',
    trackingNumber: 'DHL-AF-001',
    serviceType: 'EXPRESS',
    status: 'PROCESSED',
    createdAt: '2024-03-16T10:00:00Z',
    totalWeight: {
      value: 2.5,
      unit: 'KG',
    },
    labelUrl: 'https://api.dhl.com/africa/labels/SHP-AF-001.pdf',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateResponse()
    const result = transformRate(raw)

    expect(result.id).toBe('RATE-001')
    expect(result.carrierId).toBe('dhl-africa')
    expect(result.serviceCode).toBe('EXPRESS')
    expect(result.serviceName).toBe('DHL Express Africa')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(45.50)
    expect(result.transitDays).toBe(5)
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

describe('transformTrackingEvents', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
  })

  it('maps event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTrackingEvents(raw)[0]

    expect(event.trackingNumber).toBe('DHL-AF-001')
    expect(event.carrierId).toBe('dhl-africa')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Shipment in transit')
    expect(event.location?.street1).toBe('10 Commissioner St')
    expect(event.location?.city).toBe('Johannesburg')
    expect(event.location?.state).toBe('Gauteng')
    expect(event.location?.postalCode).toBe('2001')
    expect(event.location?.country).toBe('ZA')
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

  it('maps PROCESSED to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'PROCESSED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps OUT_FOR_DELIVERY to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'OUT_FOR_DELIVERY' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DELIVERED to DELIVERED', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'DELIVERED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps EXCEPTION to FAILURE', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'EXCEPTION' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps RETURNED to RETURN_TO_SENDER', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'RETURNED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('RETURN_TO_SENDER')
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

    expect(result.id).toBe('SHP-AF-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('DHL-AF-001')
    expect(result.carrierId).toBe('dhl-africa')
    expect(result.serviceCode).toBe('EXPRESS')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('maps label URL', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).labelUrl).toContain('SHP-AF-001.pdf')
  })
})
