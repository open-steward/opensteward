import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type TforceShipment,
} from '../../../../../src/verticals/logistics/adapters/tforce-freight/transform/shipment'
import {
  transformTracking,
  type TforceTrackingResponse,
} from '../../../../../src/verticals/logistics/adapters/tforce-freight/transform/tracking'
import {
  transformRate,
  type TforceRateQuote,
} from '../../../../../src/verticals/logistics/adapters/tforce-freight/transform/rate'

function makeShipment(overrides: Partial<TforceShipment> = {}): TforceShipment {
  return {
    shipmentId: 'TFF-001',
    status: 'IN_TRANSIT',
    proNumber: 'PRO-TFF-001',
    bolNumber: 'BOL-TFF-001',
    shipper: {
      name: 'Shipper',
      company: 'Co',
      address1: '10 Origin Ln',
      address2: null,
      city: 'Richmond',
      stateProvince: 'VA',
      postalCode: '23219',
      country: 'US',
      phone: '+15555550000',
      email: null,
    },
    consignee: {
      name: 'Consignee',
      company: 'Co2',
      address1: '20 Dest Rd',
      address2: null,
      city: 'Atlanta',
      stateProvince: 'GA',
      postalCode: '30301',
      country: 'US',
      phone: null,
      email: null,
    },
    totalWeight: 1800,
    weightUnit: 'lb',
    serviceLevel: 'GROUND',
    reference: 'REF-TFF-001',
    createdDate: '2024-08-01T10:00:00Z',
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<TforceTrackingResponse> = {},
): TforceTrackingResponse {
  return {
    proNumber: 'PRO-TFF-001',
    currentStatusCode: 'IT',
    events: [
      {
        statusCode: 'PU',
        statusDescription: 'Picked up',
        eventDateTime: '2024-08-01T09:00:00Z',
        city: 'Richmond',
        stateProvince: 'VA',
      },
      {
        statusCode: 'IT',
        statusDescription: 'In transit',
        eventDateTime: '2024-08-02T07:00:00Z',
        city: 'Charlotte',
        stateProvince: 'NC',
      },
    ],
    ...overrides,
  }
}

function makeRate(overrides: Partial<TforceRateQuote> = {}): TforceRateQuote {
  return {
    quoteNumber: 'Q-TFF-1',
    serviceLevel: 'GROUND',
    serviceLevelDescription: 'TForce Ground',
    totalCharges: 412.75,
    currency: 'USD',
    transitDays: 3,
    estimatedDeliveryDate: '2024-08-04',
    guaranteed: false,
    lineItems: [
      { code: 'LH', description: 'Linehaul', amount: 350 },
      { code: 'FSC', description: 'Fuel', amount: 62.75 },
    ],
    ...overrides,
  }
}

describe('TforceFreight transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('TFF-001')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.carrierId).toBe('tforce-freight')
    expect(r.trackingNumber).toBe('PRO-TFF-001')
    expect(r.reference).toBe('BOL-TFF-001')
  })

  it('maps addresses', () => {
    const r = transformShipment(makeShipment())
    expect(r.originAddress?.city).toBe('Richmond')
    expect(r.destinationAddress?.city).toBe('Atlanta')
  })

  it('maps weight', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(1800)
    expect(r.totalWeight?.unit).toBe('lb')
  })

  it('preserves metadata', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const r = transformShipment(makeShipment({
      shipper: null, consignee: null, totalWeight: null,
      proNumber: null, bolNumber: null, reference: null,
      serviceLevel: null, createdDate: null,
    }))
    expect(r.originAddress).toBeUndefined()
    expect(r.totalWeight).toBeUndefined()
    expect(r.trackingNumber).toBeUndefined()
    expect(r.createdAt).toBeUndefined()
  })

  it('maps all statuses', () => {
    const cases: [string, string][] = [
      ['PENDING', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['CANCELLED', 'CANCELLED'],
      ['UNKNOWN_X', 'UNKNOWN'],
    ]
    for (const [s, e] of cases) {
      expect(transformShipment(makeShipment({ status: s })).status).toBe(e)
    }
  })
})

describe('TforceFreight transformTracking', () => {
  it('emits one event per entry', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps fields', () => {
    const e = transformTracking(makeTrackingResponse())[0]
    expect(e.carrierId).toBe('tforce-freight')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.location?.city).toBe('Richmond')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    transformTracking(makeTrackingResponse()).forEach((e) =>
      expect(e.metadata).toBeDefined(),
    )
  })

  it('fallback when events empty', () => {
    const events = transformTracking(makeTrackingResponse({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('maps all status codes', () => {
    const cases: [string, string][] = [
      ['PU', 'PRE_TRANSIT'],
      ['IT', 'IN_TRANSIT'],
      ['OFD', 'OUT_FOR_DELIVERY'],
      ['DL', 'DELIVERED'],
      ['EX', 'FAILURE'],
      ['OH', 'UNKNOWN'],
      ['??', 'UNKNOWN'],
    ]
    for (const [c, expected] of cases) {
      const r = makeTrackingResponse({
        events: [{
          statusCode: c, statusDescription: 'x',
          eventDateTime: '2024-08-01T00:00:00Z',
          city: null, stateProvince: null,
        }],
      })
      expect(transformTracking(r)[0].status).toBe(expected)
    }
  })
})

describe('TforceFreight transformRate', () => {
  it('maps canonical fields', () => {
    const r = transformRate(makeRate())
    expect(r.id).toBe('Q-TFF-1')
    expect(r.carrierId).toBe('tforce-freight')
    expect(r.totalAmount).toBe(412.75)
    expect(r.currency).toBe('USD')
    expect(r.transitDays).toBe(3)
  })

  it('preserves metadata', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const r = transformRate(makeRate({ transitDays: null, estimatedDeliveryDate: null, guaranteed: null }))
    expect(r.transitDays).toBeUndefined()
    expect(r.estimatedDeliveryAt).toBeUndefined()
  })

  it('defaults currency to USD', () => {
    expect(transformRate(makeRate({ currency: null })).currency).toBe('USD')
  })
})
