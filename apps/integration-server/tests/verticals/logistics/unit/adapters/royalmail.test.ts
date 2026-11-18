import { describe, it, expect } from 'vitest'
import { transformRate, type RoyalMailRateResponse } from '../../../../../src/verticals/logistics/adapters/royalmail/transform/rate'
import { transformTrackingEvents, type RoyalMailTrackingResponse, type RoyalMailTrackingEvent } from '../../../../../src/verticals/logistics/adapters/royalmail/transform/tracking'
import { transformShipment, type RoyalMailShipmentResponse } from '../../../../../src/verticals/logistics/adapters/royalmail/transform/shipment'
import { transformLabel } from '../../../../../src/verticals/logistics/adapters/royalmail/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateResponse(overrides: Partial<RoyalMailRateResponse> = {}): RoyalMailRateResponse {
  return {
    serviceCode: 'TRACKED_24',
    serviceName: 'Royal Mail Tracked 24',
    totalPrice: 5.99,
    currency: 'GBP',
    estimatedDeliveryDate: '2024-01-20T00:00:00Z',
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<RoyalMailTrackingEvent> = {}): RoyalMailTrackingEvent {
  return {
    eventDateTime: '2024-01-16T14:30:00Z',
    eventType: 'IN_TRANSIT',
    eventDescription: 'Item in transit',
    location: {
      city: 'London',
      county: 'Greater London',
      postCode: 'EC1A 1BB',
      countryCode: 'GB',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<RoyalMailTrackingResponse> = {}): RoyalMailTrackingResponse {
  return {
    trackingNumber: 'AB123456789GB',
    events: [makeTrackingEvent()],
    summary: {
      statusCategory: 'IN_TRANSIT',
      statusDescription: 'Item in transit',
    },
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<RoyalMailShipmentResponse> = {}): RoyalMailShipmentResponse {
  return {
    shipmentId: 'SHP-001',
    trackingNumber: 'AB123456789GB',
    serviceCode: 'TRACKED_24',
    status: 'CREATED',
    createdAt: '2024-01-16T10:00:00Z',
    labelData: 'base64encodedlabeldata==',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateResponse()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('royalmail')
    expect(result.serviceCode).toBe('TRACKED_24')
    expect(result.serviceName).toBe('Royal Mail Tracked 24')
    expect(result.currency).toBe('GBP')
    expect(result.totalAmount).toBe(5.99)
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

  it('defaults currency to GBP', () => {
    const raw = makeRateResponse({ currency: undefined })
    expect(transformRate(raw).currency).toBe('GBP')
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

    expect(event.trackingNumber).toBe('AB123456789GB')
    expect(event.carrierId).toBe('royalmail')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Item in transit')
    expect(event.location?.city).toBe('London')
    expect(event.location?.state).toBe('Greater London')
    expect(event.location?.country).toBe('GB')
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

  it('maps RECEIVED to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ eventType: 'RECEIVED' })] })
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

  it('maps ATTEMPTED to FAILURE', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ eventType: 'ATTEMPTED' })] })
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

    expect(result.id).toBe('SHP-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('AB123456789GB')
    expect(result.carrierId).toBe('royalmail')
    expect(result.serviceCode).toBe('TRACKED_24')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})

// ─── transformLabel ──────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformLabel(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.shipmentId).toBe('SHP-001')
    expect(result.trackingNumber).toBe('AB123456789GB')
    expect(result.carrierId).toBe('royalmail')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('base64encodedlabeldata==')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing labelData', () => {
    const raw = makeShipmentResponse({ labelData: undefined })
    expect(transformLabel(raw).base64).toBeUndefined()
  })
})
