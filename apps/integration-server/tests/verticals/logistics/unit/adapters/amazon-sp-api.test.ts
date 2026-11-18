import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type SpApiTrackingResponse,
  type SpApiTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/amazon-sp-api/transform/tracking'
import {
  transformShipment,
  type SpApiShipment,
} from '../../../../../src/verticals/logistics/adapters/amazon-sp-api/transform/shipment'

function makeTrackingEvent(overrides: Partial<SpApiTrackingEvent> = {}): SpApiTrackingEvent {
  return {
    eventCode: 'InTransit',
    eventTime: '2025-04-01T08:00:00Z',
    description: 'Shipment in transit',
    location: {
      city: 'Phoenix',
      stateOrRegion: 'AZ',
      countryCode: 'US',
      postalCode: '85001',
    },
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<SpApiTrackingResponse> = {},
): SpApiTrackingResponse {
  return {
    trackingId: 'SPAPI-TRK-001',
    shipmentId: 'shp-spapi-001',
    summary: { status: 'InTransit' },
    eventHistory: [
      makeTrackingEvent({ eventCode: 'Pickup', description: 'Picked up' }),
      makeTrackingEvent(),
      makeTrackingEvent({ eventCode: 'Delivered', description: 'Delivered' }),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<SpApiShipment> = {}): SpApiShipment {
  return {
    shipmentId: 'shp-spapi-001',
    trackingId: 'SPAPI-TRK-001',
    status: 'InTransit',
    serviceType: 'Std',
    shipFrom: {
      name: 'FC-PHX',
      street1: '6835 W Buckeye Rd',
      city: 'Phoenix',
      state: 'AZ',
      postalCode: '85043',
      country: 'US',
    },
    shipTo: {
      name: 'Bob Smith',
      street1: '100 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    },
    totalWeight: { value: 1.2, unit: 'kg' },
    labelUrl: 'https://amzn.com/label.pdf',
    clientReferenceId: 'REF-SPAPI-1',
    createdAt: '2025-04-01T07:00:00Z',
    updatedAt: '2025-04-01T08:00:00Z',
    ...overrides,
  }
}

describe('Amazon SP-API transformTracking', () => {
  it('produces one event per tracking event', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events).toHaveLength(3)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]
    expect(event.trackingNumber).toBe('SPAPI-TRK-001')
    expect(event.shipmentId).toBe('shp-spapi-001')
    expect(event.carrierId).toBe('amazon-sp-api')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Picked up')
    expect(event.location?.city).toBe('Phoenix')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const events = transformTracking(makeTrackingResponse())
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a fallback event when eventHistory is empty', () => {
    const events = transformTracking(
      makeTrackingResponse({ eventHistory: [], summary: { status: 'OutForDelivery' } }),
    )
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('OUT_FOR_DELIVERY')
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
      ['DepartedCarrierFacility', 'IN_TRANSIT'],
      ['OutForDelivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'FAILURE'],
      ['Returned', 'RETURN_TO_SENDER'],
      ['weird', 'UNKNOWN'],
    ]
    for (const [eventCode, expected] of cases) {
      const events = transformTracking(
        makeTrackingResponse({ eventHistory: [makeTrackingEvent({ eventCode })] }),
      )
      expect(events[0].status).toBe(expected)
    }
  })
})

describe('Amazon SP-API transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('shp-spapi-001')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.carrierId).toBe('amazon-sp-api')
    expect(r.trackingNumber).toBe('SPAPI-TRK-001')
    expect(r.serviceCode).toBe('Std')
    expect(r.reference).toBe('REF-SPAPI-1')
  })

  it('maps addresses', () => {
    const r = transformShipment(makeShipment())
    expect(r.originAddress?.city).toBe('Phoenix')
    expect(r.destinationAddress?.city).toBe('Austin')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const r = transformShipment(
      makeShipment({
        trackingId: null,
        status: null,
        shipFrom: null,
        shipTo: null,
        totalWeight: null,
        labelUrl: null,
        clientReferenceId: null,
        serviceType: null,
        createdAt: null,
        updatedAt: null,
      }),
    )
    expect(r.status).toBe('UNKNOWN')
    expect(r.originAddress).toBeUndefined()
    expect(r.destinationAddress).toBeUndefined()
    expect(r.totalWeight).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['Created', 'LABEL_CREATED'],
      ['LabelCreated', 'LABEL_CREATED'],
      ['LabelPurchased', 'LABEL_CREATED'],
      ['InTransit', 'IN_TRANSIT'],
      ['Pickup', 'IN_TRANSIT'],
      ['OutForDelivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'EXCEPTION'],
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
