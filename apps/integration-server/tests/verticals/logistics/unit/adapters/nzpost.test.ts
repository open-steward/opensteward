import { describe, it, expect } from 'vitest'
import { transformTrackingEvents, type NZPostTrackingResponse, type NZPostTrackingEvent } from '../../../../../src/verticals/logistics/adapters/nzpost/transform/tracking'
import { transformShipment, type NZPostShipmentResponse } from '../../../../../src/verticals/logistics/adapters/nzpost/transform/shipment'
import { transformRate, type NZPostRateResponse } from '../../../../../src/verticals/logistics/adapters/nzpost/transform/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateResponse(overrides: Partial<NZPostRateResponse> = {}): NZPostRateResponse {
  return {
    serviceCode: 'PARCELPOST_STANDARD',
    serviceName: 'ParcelPost Standard',
    totalPrice: 12.50,
    currency: 'NZD',
    estimatedDeliveryDate: '2024-01-20T00:00:00Z',
    transitDays: 3,
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<NZPostTrackingEvent> = {}): NZPostTrackingEvent {
  return {
    eventDateTime: '2024-01-16T14:30:00Z',
    eventType: 'IN_TRANSIT',
    eventDescription: 'Parcel in transit',
    location: {
      city: 'Auckland',
      region: 'Auckland',
      postCode: '1010',
      countryCode: 'NZ',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<NZPostTrackingResponse> = {}): NZPostTrackingResponse {
  return {
    trackingNumber: 'NZ123456789',
    status: 'IN_TRANSIT',
    statusDescription: 'Parcel in transit',
    events: [makeTrackingEvent()],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<NZPostShipmentResponse> = {}): NZPostShipmentResponse {
  return {
    parcelId: 'PCL-001',
    trackingNumber: 'NZ123456789',
    serviceCode: 'PARCELPOST_STANDARD',
    status: 'CREATED',
    createdAt: '2024-01-16T10:00:00Z',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateResponse()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('nzpost')
    expect(result.serviceCode).toBe('PARCELPOST_STANDARD')
    expect(result.serviceName).toBe('ParcelPost Standard')
    expect(result.currency).toBe('NZD')
    expect(result.totalAmount).toBe(12.50)
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

  it('defaults currency to NZD', () => {
    const raw = makeRateResponse({ currency: undefined })
    expect(transformRate(raw).currency).toBe('NZD')
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

    expect(event.trackingNumber).toBe('NZ123456789')
    expect(event.carrierId).toBe('nzpost')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Parcel in transit')
    expect(event.location?.city).toBe('Auckland')
    expect(event.location?.state).toBe('Auckland')
    expect(event.location?.country).toBe('NZ')
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

  it('maps PICKED_UP to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ eventType: 'PICKED_UP' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps DELIVERED to DELIVERED', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ eventType: 'DELIVERED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps OUT_FOR_DELIVERY to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ eventType: 'OUT_FOR_DELIVERY' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps CARDED to FAILURE', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ eventType: 'CARDED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps RETURNED to RETURN_TO_SENDER', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ eventType: 'RETURNED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ eventType: 'ZZ_UNKNOWN' })] })
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

    expect(result.id).toBe('PCL-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('NZ123456789')
    expect(result.carrierId).toBe('nzpost')
    expect(result.serviceCode).toBe('PARCELPOST_STANDARD')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
