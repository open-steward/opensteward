import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type SeflShipment,
} from '../../../../../src/verticals/logistics/adapters/sefl/transform/shipment'
import {
  transformTracking,
  type SeflTrackingResponse,
} from '../../../../../src/verticals/logistics/adapters/sefl/transform/tracking'
import {
  transformRate,
  type SeflRateQuote,
} from '../../../../../src/verticals/logistics/adapters/sefl/transform/rate'

function makeShipment(overrides: Partial<SeflShipment> = {}): SeflShipment {
  return {
    shipmentId: 'SEFL-001',
    status: 'IN_TRANSIT',
    proNumber: 'PRO-SEFL-001',
    bolNumber: 'BOL-SEFL-001',
    shipper: {
      name: 'Shipper', company: 'ShipCo',
      address1: '100 Origin Way', address2: null,
      city: 'Columbia', state: 'SC',
      zip: '29201', country: 'US',
      phone: '+18035551234', email: null,
    },
    consignee: {
      name: 'Consignee', company: 'ConsCo',
      address1: '200 Dest Pl', address2: null,
      city: 'Charlotte', state: 'NC',
      zip: '28202', country: 'US',
      phone: null, email: null,
    },
    totalWeight: 1100,
    weightUnit: 'lb',
    serviceLevel: 'LTL',
    reference: 'REF-SEFL-001',
    createdDate: '2024-10-01T13:00:00Z',
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<SeflTrackingResponse> = {},
): SeflTrackingResponse {
  return {
    result: {
      proNumber: 'PRO-SEFL-001',
      currentStatus: 'IT',
      history: [
        {
          statusCode: 'PU',
          statusDescription: 'Picked up',
          eventDateTime: '2024-10-01T14:00:00Z',
          city: 'Columbia',
          state: 'SC',
        },
        {
          statusCode: 'IT',
          statusDescription: 'In transit',
          eventDateTime: '2024-10-02T06:00:00Z',
          city: 'Charlotte',
          state: 'NC',
        },
      ],
    },
    ...overrides,
  }
}

function makeRate(overrides: Partial<SeflRateQuote> = {}): SeflRateQuote {
  return {
    quoteNumber: 'Q-SEFL-1',
    serviceLevel: 'LTL',
    serviceLevelDescription: 'SEFL LTL',
    totalAmount: 367.2,
    currency: 'USD',
    transitDays: 2,
    estimatedDeliveryDate: '2024-10-03',
    guaranteed: false,
    lineItems: null,
    ...overrides,
  }
}

describe('SEFL transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('SEFL-001')
    expect(r.carrierId).toBe('sefl')
    expect(r.trackingNumber).toBe('PRO-SEFL-001')
    expect(r.reference).toBe('BOL-SEFL-001')
    expect(r.status).toBe('IN_TRANSIT')
  })

  it('maps addresses', () => {
    const r = transformShipment(makeShipment())
    expect(r.originAddress?.city).toBe('Columbia')
    expect(r.originAddress?.postalCode).toBe('29201')
    expect(r.destinationAddress?.city).toBe('Charlotte')
  })

  it('maps weight', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(1100)
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
  })

  it('maps all statuses', () => {
    const cases: [string, string][] = [
      ['PENDING', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['CANCELLED', 'CANCELLED'],
      ['HUH', 'UNKNOWN'],
    ]
    for (const [s, e] of cases) {
      expect(transformShipment(makeShipment({ status: s })).status).toBe(e)
    }
  })
})

describe('SEFL transformTracking', () => {
  it('emits one event per history entry', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps fields', () => {
    const e = transformTracking(makeTrackingResponse())[0]
    expect(e.carrierId).toBe('sefl')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.location?.city).toBe('Columbia')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('preserves metadata on every event', () => {
    transformTracking(makeTrackingResponse()).forEach((e) =>
      expect(e.metadata).toBeDefined(),
    )
  })

  it('fallback when result missing', () => {
    const events = transformTracking({ result: null })
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
      ['HD', 'UNKNOWN'],
      ['??', 'UNKNOWN'],
    ]
    for (const [c, expected] of cases) {
      const r: SeflTrackingResponse = {
        result: {
          proNumber: 'P', currentStatus: c,
          history: [{
            statusCode: c, statusDescription: 'x',
            eventDateTime: '2024-10-01T00:00:00Z',
            city: null, state: null,
          }],
        },
      }
      expect(transformTracking(r)[0].status).toBe(expected)
    }
  })
})

describe('SEFL transformRate', () => {
  it('maps canonical fields', () => {
    const r = transformRate(makeRate())
    expect(r.id).toBe('Q-SEFL-1')
    expect(r.carrierId).toBe('sefl')
    expect(r.totalAmount).toBe(367.2)
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
    const r = transformRate(makeRate({ transitDays: null, estimatedDeliveryDate: null, guaranteed: null }))
    expect(r.transitDays).toBeUndefined()
    expect(r.estimatedDeliveryAt).toBeUndefined()
  })
})
