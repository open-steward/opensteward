import { describe, it, expect } from 'vitest'
import { transformRate, type XpoRateQuote } from '../../../../../src/verticals/logistics/adapters/xpo/transform/rate'
import { transformTrackingEvents, type XpoTrackingResponse, type XpoTrackingEvent } from '../../../../../src/verticals/logistics/adapters/xpo/transform/tracking'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateQuote(overrides: Partial<XpoRateQuote> = {}): XpoRateQuote {
  return {
    serviceType: 'LTL_STANDARD',
    serviceName: 'XPO Standard LTL',
    totalCharge: 310.75,
    currency: 'USD',
    transitDays: 4,
    estimatedDeliveryDate: '2024-01-20T00:00:00Z',
    guaranteedService: false,
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<XpoTrackingEvent> = {}): XpoTrackingEvent {
  return {
    dateTime: '2024-01-16T14:30:00Z',
    status: 'In Transit',
    description: 'Shipment in transit',
    city: 'Charlotte',
    state: 'NC',
    postalCode: '28201',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<XpoTrackingResponse> = {}): XpoTrackingResponse {
  return {
    proNumber: '5550001234',
    status: 'In Transit',
    statusDescription: 'Shipment in transit',
    events: [makeTrackingEvent()],
    estimatedDeliveryDate: '2024-01-18T12:00:00Z',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateQuote()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('xpo')
    expect(result.serviceCode).toBe('LTL_STANDARD')
    expect(result.serviceName).toBe('XPO Standard LTL')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(310.75)
    expect(result.transitDays).toBe(4)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateQuote()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles guaranteed service flag', () => {
    const raw = makeRateQuote({ guaranteedService: true })
    expect(transformRate(raw).isGuaranteedDelivery).toBe(true)
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

    expect(event.trackingNumber).toBe('5550001234')
    expect(event.carrierId).toBe('xpo')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.location?.city).toBe('Charlotte')
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

  it('maps On Hand to AVAILABLE_FOR_PICKUP', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'On Hand' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps Exception to FAILURE', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'Exception' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'ZZ_Unknown' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
  })

  it('handles missing location', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ city: undefined, state: undefined, postalCode: undefined })],
    })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })
})
