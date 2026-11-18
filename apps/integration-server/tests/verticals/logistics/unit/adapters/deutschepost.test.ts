import { describe, it, expect } from 'vitest'
import { transformRate, type DeutschePostProductPrice } from '../../../../../src/verticals/logistics/adapters/deutschepost/transform/rate'
import { transformTrackingEvents, type DeutschePostTrackingResponse, type DeutschePostTrackingEvent } from '../../../../../src/verticals/logistics/adapters/deutschepost/transform/tracking'
import { transformShipment, type DeutschePostShipmentResponse } from '../../../../../src/verticals/logistics/adapters/deutschepost/transform/shipment'
import { transformLabel, type DeutschePostLabelResponse } from '../../../../../src/verticals/logistics/adapters/deutschepost/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeProductPrice(overrides: Partial<DeutschePostProductPrice> = {}): DeutschePostProductPrice {
  return {
    productCode: 'PAKET_INTERNATIONAL',
    productName: 'DHL Paket International',
    price: 12.5,
    currency: 'EUR',
    deliveryTimeMin: 3,
    deliveryTimeMax: 7,
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<DeutschePostTrackingEvent> = {}): DeutschePostTrackingEvent {
  return {
    timestamp: '2024-01-16T14:30:00Z',
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    location: {
      city: 'Berlin',
      state: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<DeutschePostTrackingResponse> = {}): DeutschePostTrackingResponse {
  return {
    shipmentId: 'SHP-001',
    trackingNumber: '340434161094042557',
    events: [makeTrackingEvent()],
    currentStatus: {
      status: 'IN_TRANSIT',
      description: 'Shipment in transit',
    },
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<DeutschePostShipmentResponse> = {}): DeutschePostShipmentResponse {
  return {
    shipmentId: 'SHP-001',
    trackingNumber: '340434161094042557',
    product: 'PAKET_INTERNATIONAL',
    status: 'CREATED',
    createdAt: '2024-01-16T10:00:00Z',
    ...overrides,
  }
}

function makeLabelResponse(overrides: Partial<DeutschePostLabelResponse> = {}): DeutschePostLabelResponse {
  return {
    shipmentId: 'SHP-001',
    trackingNumber: '340434161094042557',
    product: 'PAKET_INTERNATIONAL',
    labelData: 'base64encodedlabeldata==',
    labelFormat: 'PDF',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeProductPrice()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('deutschepost')
    expect(result.serviceCode).toBe('PAKET_INTERNATIONAL')
    expect(result.serviceName).toBe('DHL Paket International')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(12.5)
    expect(result.transitDays).toBe(7)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeProductPrice()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('defaults currency to EUR', () => {
    const raw = makeProductPrice({ currency: undefined })
    expect(transformRate(raw).currency).toBe('EUR')
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

    expect(event.trackingNumber).toBe('340434161094042557')
    expect(event.carrierId).toBe('deutschepost')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Shipment in transit')
    expect(event.location?.city).toBe('Berlin')
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

  it('maps REGISTERED to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'REGISTERED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps CUSTOMS to IN_TRANSIT', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status: 'CUSTOMS' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('IN_TRANSIT')
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
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('340434161094042557')
    expect(result.carrierId).toBe('deutschepost')
    expect(result.serviceCode).toBe('PAKET_INTERNATIONAL')
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
    const raw = makeLabelResponse()
    const result = transformLabel(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.shipmentId).toBe('SHP-001')
    expect(result.trackingNumber).toBe('340434161094042557')
    expect(result.carrierId).toBe('deutschepost')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('base64encodedlabeldata==')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeLabelResponse()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing labelData', () => {
    const raw = makeLabelResponse({ labelData: undefined })
    expect(transformLabel(raw).base64).toBeUndefined()
  })

  it('handles missing labelFormat', () => {
    const raw = makeLabelResponse({ labelFormat: undefined })
    expect(transformLabel(raw).format).toBeUndefined()
  })
})
