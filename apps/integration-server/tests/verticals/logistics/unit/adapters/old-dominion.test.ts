import { describe, it, expect } from 'vitest'
import { transformRate, type OldDominionRateQuote } from '../../../../../src/verticals/logistics/adapters/old-dominion/transform/rate'
import { transformTrackingEvents, type OldDominionTrackingResponse, type OldDominionTrackingEvent } from '../../../../../src/verticals/logistics/adapters/old-dominion/transform/tracking'
import { transformShipment, type OldDominionPickupResponse } from '../../../../../src/verticals/logistics/adapters/old-dominion/transform/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateQuote(overrides: Partial<OldDominionRateQuote> = {}): OldDominionRateQuote {
  return {
    serviceType: 'LTL_STANDARD',
    serviceName: 'OD Standard LTL',
    totalCharge: 245.50,
    currency: 'USD',
    transitDays: 3,
    estimatedDeliveryDate: '2024-01-20T00:00:00Z',
    guaranteedService: false,
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<OldDominionTrackingEvent> = {}): OldDominionTrackingEvent {
  return {
    dateTime: '2024-01-16T14:30:00Z',
    status: 'In Transit',
    description: 'Shipment in transit',
    city: 'Thomasville',
    state: 'NC',
    postalCode: '27360',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<OldDominionTrackingResponse> = {}): OldDominionTrackingResponse {
  return {
    proNumber: '1234567890',
    status: 'In Transit',
    statusDescription: 'Shipment in transit',
    events: [makeTrackingEvent()],
    estimatedDeliveryDate: '2024-01-18T12:00:00Z',
    ...overrides,
  }
}

function makePickupResponse(overrides: Partial<OldDominionPickupResponse> = {}): OldDominionPickupResponse {
  return {
    confirmationNumber: 'PU-12345',
    proNumber: '1234567890',
    pickupDate: '2024-01-16T10:00:00Z',
    status: 'CONFIRMED',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateQuote()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('old-dominion')
    expect(result.serviceCode).toBe('LTL_STANDARD')
    expect(result.serviceName).toBe('OD Standard LTL')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(245.50)
    expect(result.transitDays).toBe(3)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.isGuaranteedDelivery).toBe(false)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateQuote()
    expect(transformRate(raw).metadata).toBe(raw)
  })
})

// ─── transformTrackingEvents ────────────────────────────────────────────────

describe('transformTrackingEvents', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    expect(transformTrackingEvents(raw)).toHaveLength(1)
  })

  it('maps event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTrackingEvents(raw)[0]

    expect(event.trackingNumber).toBe('1234567890')
    expect(event.carrierId).toBe('old-dominion')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.location?.city).toBe('Thomasville')
    expect(event.location?.state).toBe('NC')
    expect(event.location?.country).toBe('US')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata', () => {
    const raw = makeTrackingResponse()
    transformTrackingEvents(raw).forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits summary when events is empty', () => {
    const raw = makeTrackingResponse({ events: [] })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps Picked Up to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'Picked Up' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps Delivered to DELIVERED', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'Delivered' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps Out for Delivery to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'Out for Delivery' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps Exception to FAILURE', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'Exception' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps Appointment Set to IN_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'Appointment Set' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'ZZ_Unknown' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
  })
})

// ─── transformShipment (Pickup) ─────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makePickupResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('PU-12345')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('1234567890')
    expect(result.carrierId).toBe('old-dominion')
    expect(result.reference).toBe('PU-12345')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makePickupResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
