import { describe, it, expect } from 'vitest'
import { transformTrackingEvents, type NinjaVanTrackingResponse, type NinjaVanTrackingEvent } from '../../../../../src/verticals/logistics/adapters/ninja-van/transform/tracking'
import { transformShipment, type NinjaVanShipmentResponse } from '../../../../../src/verticals/logistics/adapters/ninja-van/transform/shipment'
import { transformRate, type NinjaVanRateResponse } from '../../../../../src/verticals/logistics/adapters/ninja-van/transform/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateResponse(overrides: Partial<NinjaVanRateResponse> = {}): NinjaVanRateResponse {
  return {
    serviceType: 'STANDARD',
    serviceName: 'Standard Delivery',
    totalPrice: 5.50,
    currency: 'SGD',
    estimatedDeliveryDate: '2024-01-20T00:00:00Z',
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<NinjaVanTrackingEvent> = {}): NinjaVanTrackingEvent {
  return {
    timestamp: '2024-01-16T14:30:00Z',
    status: 'InTransit',
    description: 'Parcel in transit',
    location: {
      city: 'Singapore',
      state: 'Singapore',
      postcode: '238801',
      country: 'SG',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<NinjaVanTrackingResponse> = {}): NinjaVanTrackingResponse {
  return {
    trackingId: 'NVSG123456789',
    status: 'InTransit',
    statusDescription: 'Parcel in transit',
    events: [makeTrackingEvent()],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<NinjaVanShipmentResponse> = {}): NinjaVanShipmentResponse {
  return {
    id: 'ORD-001',
    trackingId: 'NVSG123456789',
    serviceType: 'STANDARD',
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

    expect(result.carrierId).toBe('ninja-van')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.serviceName).toBe('Standard Delivery')
    expect(result.currency).toBe('SGD')
    expect(result.totalAmount).toBe(5.50)
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

  it('defaults currency to SGD', () => {
    const raw = makeRateResponse({ currency: undefined })
    expect(transformRate(raw).currency).toBe('SGD')
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

    expect(event.trackingNumber).toBe('NVSG123456789')
    expect(event.carrierId).toBe('ninja-van')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Parcel in transit')
    expect(event.location?.city).toBe('Singapore')
    expect(event.location?.state).toBe('Singapore')
    expect(event.location?.country).toBe('SG')
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

  it('maps Pending to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'Pending' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps PickedUp to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'PickedUp' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps OutForDelivery to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'OutForDelivery' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps Completed to DELIVERED', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'Completed' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps Failed to FAILURE', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'Failed' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps ReturnedToSender to RETURN_TO_SENDER', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'ReturnedToSender' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps OnHold to UNKNOWN', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'OnHold' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
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

    expect(result.id).toBe('ORD-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('NVSG123456789')
    expect(result.carrierId).toBe('ninja-van')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
