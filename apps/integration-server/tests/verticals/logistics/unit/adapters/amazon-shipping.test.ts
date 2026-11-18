import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type AmazonTrackingResponse,
  type AmazonTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/amazon-shipping/transform/tracking'
import {
  transformShipment,
  type AmazonShippingShipment,
} from '../../../../../src/verticals/logistics/adapters/amazon-shipping/transform/shipment'

// ─── Factories ──────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<AmazonTrackingEvent> = {}): AmazonTrackingEvent {
  return {
    eventCode: 'InTransit',
    eventTime: '2025-04-01T12:00:00Z',
    description: 'Arrived at sort facility',
    location: {
      city: 'Seattle',
      stateOrRegion: 'WA',
      countryCode: 'US',
      postalCode: '98101',
    },
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<AmazonTrackingResponse> = {},
): AmazonTrackingResponse {
  return {
    trackingId: 'TBA123456789',
    shipmentId: 'shp-amzn-001',
    summary: { status: 'InTransit' },
    eventHistory: [
      makeTrackingEvent({ eventCode: 'Pickup', description: 'Package picked up' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(
  overrides: Partial<AmazonShippingShipment> = {},
): AmazonShippingShipment {
  return {
    shipmentId: 'shp-amzn-001',
    trackingId: 'TBA123456789',
    status: 'LabelPurchased',
    serviceType: 'AmazonShippingStandard',
    shipFrom: {
      name: 'Warehouse A',
      street1: '410 Terry Ave N',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98109',
      country: 'US',
    },
    shipTo: {
      name: 'Jane Doe',
      street1: '1 Apple Park Way',
      city: 'Cupertino',
      state: 'CA',
      postalCode: '95014',
      country: 'US',
    },
    totalWeight: { value: 2.5, unit: 'kg' },
    labelUrl: 'https://amazon.com/labels/shp-amzn-001.pdf',
    clientReferenceId: 'REF-001',
    createdAt: '2025-04-01T10:00:00Z',
    updatedAt: '2025-04-01T12:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Amazon Shipping transformTracking', () => {
  it('produces one event per tracking event', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]
    expect(event.trackingNumber).toBe('TBA123456789')
    expect(event.shipmentId).toBe('shp-amzn-001')
    expect(event.carrierId).toBe('amazon-shipping')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Package picked up')
    expect(event.location?.city).toBe('Seattle')
    expect(event.location?.state).toBe('WA')
    expect(event.location?.country).toBe('US')
    expect(event.location?.postalCode).toBe('98101')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const events = transformTracking(makeTrackingResponse())
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a fallback event when eventHistory is empty', () => {
    const events = transformTracking(
      makeTrackingResponse({ eventHistory: [], summary: { status: 'Delivered' } }),
    )
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('DELIVERED')
  })

  it('handles null location gracefully', () => {
    const events = transformTracking(
      makeTrackingResponse({ eventHistory: [makeTrackingEvent({ location: null })] }),
    )
    expect(events[0].location).toBeUndefined()
  })

  it('maps all event codes correctly', () => {
    const cases: [string, string][] = [
      ['Pickup', 'PRE_TRANSIT'],
      ['InTransit', 'IN_TRANSIT'],
      ['ArrivedAtCarrierFacility', 'IN_TRANSIT'],
      ['OutForDelivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'FAILURE'],
      ['Undeliverable', 'FAILURE'],
      ['Returned', 'RETURN_TO_SENDER'],
      ['SomethingElse', 'UNKNOWN'],
    ]
    for (const [eventCode, expected] of cases) {
      const events = transformTracking(
        makeTrackingResponse({ eventHistory: [makeTrackingEvent({ eventCode })] }),
      )
      expect(events[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Amazon Shipping transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('shp-amzn-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('TBA123456789')
    expect(result.carrierId).toBe('amazon-shipping')
    expect(result.serviceCode).toBe('AmazonShippingStandard')
    expect(result.reference).toBe('REF-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.city).toBe('Seattle')
    expect(result.destinationAddress?.city).toBe('Cupertino')
    expect(result.destinationAddress?.name).toBe('Jane Doe')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformShipment(
      makeShipment({
        trackingId: null,
        status: null,
        serviceType: null,
        shipFrom: null,
        shipTo: null,
        totalWeight: null,
        labelUrl: null,
        clientReferenceId: null,
        createdAt: null,
        updatedAt: null,
      }),
    )
    expect(result.trackingNumber).toBeUndefined()
    expect(result.status).toBe('UNKNOWN')
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['Created', 'LABEL_CREATED'],
      ['LabelCreated', 'LABEL_CREATED'],
      ['LabelPurchased', 'LABEL_CREATED'],
      ['Pickup', 'IN_TRANSIT'],
      ['InTransit', 'IN_TRANSIT'],
      ['OutForDelivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'EXCEPTION'],
      ['Undeliverable', 'EXCEPTION'],
      ['Returned', 'RETURNED'],
      ['Cancelled', 'CANCELLED'],
      ['Voided', 'CANCELLED'],
      ['nope', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })
})
