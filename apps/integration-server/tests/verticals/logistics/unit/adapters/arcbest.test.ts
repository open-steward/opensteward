import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ArcbestShipment,
} from '../../../../../src/verticals/logistics/adapters/arcbest/transform/shipment'
import {
  transformTracking,
  type ArcbestTrackingResponse,
} from '../../../../../src/verticals/logistics/adapters/arcbest/transform/tracking'
import {
  transformRate,
  type ArcbestRateQuote,
} from '../../../../../src/verticals/logistics/adapters/arcbest/transform/rate'

function makeShipment(overrides: Partial<ArcbestShipment> = {}): ArcbestShipment {
  return {
    requestId: 'ARC-001',
    status: 'IN_TRANSIT',
    proNumber: 'PRO-ARC-001',
    bolNumber: 'BOL-ARC-001',
    shipper: {
      name: 'Sam Shipper',
      company: 'Shipper Co',
      address1: '1 Industry Way',
      address2: null,
      city: 'Fort Smith',
      state: 'AR',
      postalCode: '72901',
      country: 'US',
      phone: '+15555550101',
      email: 'sam@example.com',
    },
    consignee: {
      name: 'Carla Consignee',
      company: 'Consignee LLC',
      address1: '2 Receiving Dr',
      address2: null,
      city: 'Dallas',
      state: 'TX',
      postalCode: '75201',
      country: 'US',
      phone: '+15555550202',
      email: 'carla@example.com',
    },
    totalWeight: 2200,
    weightUnit: 'lb',
    serviceLevel: 'STD',
    reference: 'REF-ARC-001',
    pickupDate: '2024-07-01',
    createdDate: '2024-06-30T12:00:00Z',
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<ArcbestTrackingResponse> = {},
): ArcbestTrackingResponse {
  return {
    proNumber: 'PRO-ARC-001',
    currentStatus: 'IN_TRANSIT',
    events: [
      {
        eventCode: 'PICKUP',
        eventDescription: 'Picked up from shipper',
        eventDateTime: '2024-07-01T08:00:00Z',
        city: 'Fort Smith',
        state: 'AR',
      },
      {
        eventCode: 'IN_TRANSIT',
        eventDescription: 'In transit',
        eventDateTime: '2024-07-02T05:00:00Z',
        city: 'Texarkana',
        state: 'TX',
      },
    ],
    ...overrides,
  }
}

function makeRate(overrides: Partial<ArcbestRateQuote> = {}): ArcbestRateQuote {
  return {
    quoteId: 'Q-ARC-1',
    serviceLevel: 'STD',
    serviceLevelDescription: 'ABF Standard',
    totalAmount: 525.5,
    currency: 'USD',
    transitDays: 2,
    estimatedDeliveryDate: '2024-07-03',
    guaranteed: false,
    lineItems: [
      { code: 'LH', description: 'Linehaul', amount: 400 },
      { code: 'FSC', description: 'Fuel Surcharge', amount: 125.5 },
    ],
    ...overrides,
  }
}

describe('Arcbest transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('ARC-001')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.trackingNumber).toBe('PRO-ARC-001')
    expect(r.carrierId).toBe('arcbest')
    expect(r.reference).toBe('BOL-ARC-001')
  })

  it('maps origin and destination addresses', () => {
    const r = transformShipment(makeShipment())
    expect(r.originAddress?.city).toBe('Fort Smith')
    expect(r.originAddress?.state).toBe('AR')
    expect(r.destinationAddress?.city).toBe('Dallas')
    expect(r.destinationAddress?.state).toBe('TX')
  })

  it('maps weight in lb for LTL', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(2200)
    expect(r.totalWeight?.unit).toBe('lb')
  })

  it('preserves metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const r = transformShipment(makeShipment({
      shipper: null,
      consignee: null,
      totalWeight: null,
      proNumber: null,
      bolNumber: null,
      reference: null,
      serviceLevel: null,
      createdDate: null,
    }))
    expect(r.originAddress).toBeUndefined()
    expect(r.destinationAddress).toBeUndefined()
    expect(r.totalWeight).toBeUndefined()
    expect(r.trackingNumber).toBeUndefined()
    expect(r.reference).toBeUndefined()
    expect(r.serviceCode).toBeUndefined()
    expect(r.createdAt).toBeUndefined()
  })

  it('maps all shipment statuses', () => {
    const cases: [string, string][] = [
      ['CREATED', 'PENDING'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['XYZ', 'UNKNOWN'],
    ]
    for (const [s, expected] of cases) {
      expect(transformShipment(makeShipment({ status: s })).status).toBe(expected)
    }
  })
})

describe('Arcbest transformTracking', () => {
  it('produces one event per history entry', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps tracking event fields', () => {
    const e = transformTracking(makeTrackingResponse())[0]
    expect(e.trackingNumber).toBe('PRO-ARC-001')
    expect(e.carrierId).toBe('arcbest')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.location?.city).toBe('Fort Smith')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('preserves metadata on every event', () => {
    transformTracking(makeTrackingResponse()).forEach((e) =>
      expect(e.metadata).toBeDefined(),
    )
  })

  it('emits a fallback event when events are empty', () => {
    const events = transformTracking(makeTrackingResponse({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('maps all status codes', () => {
    const cases: [string, string][] = [
      ['PICKUP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'FAILURE'],
      ['ON_HOLD', 'UNKNOWN'],
      ['NOPE', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const r = makeTrackingResponse({
        events: [
          {
            eventCode: code,
            eventDescription: 'x',
            eventDateTime: '2024-07-01T00:00:00Z',
            city: null,
            state: null,
          },
        ],
      })
      expect(transformTracking(r)[0].status).toBe(expected)
    }
  })
})

describe('Arcbest transformRate', () => {
  it('maps canonical rate fields', () => {
    const r = transformRate(makeRate())
    expect(r.id).toBe('Q-ARC-1')
    expect(r.carrierId).toBe('arcbest')
    expect(r.serviceCode).toBe('STD')
    expect(r.totalAmount).toBe(525.5)
    expect(r.currency).toBe('USD')
    expect(r.transitDays).toBe(2)
  })

  it('preserves metadata', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('defaults currency to USD', () => {
    expect(transformRate(makeRate({ currency: null })).currency).toBe('USD')
  })

  it('handles missing optional fields', () => {
    const r = transformRate(makeRate({
      transitDays: null,
      estimatedDeliveryDate: null,
      guaranteed: null,
    }))
    expect(r.transitDays).toBeUndefined()
    expect(r.estimatedDeliveryAt).toBeUndefined()
    expect(r.isGuaranteedDelivery).toBeUndefined()
  })
})
