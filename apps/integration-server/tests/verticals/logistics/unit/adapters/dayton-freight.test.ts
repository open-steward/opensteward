import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type DaytonShipment,
} from '../../../../../src/verticals/logistics/adapters/dayton-freight/transform/shipment'
import {
  transformTracking,
  type DaytonTrackingResponse,
} from '../../../../../src/verticals/logistics/adapters/dayton-freight/transform/tracking'
import {
  transformRate,
  type DaytonRateQuote,
} from '../../../../../src/verticals/logistics/adapters/dayton-freight/transform/rate'

function makeShipment(overrides: Partial<DaytonShipment> = {}): DaytonShipment {
  return {
    shipmentNumber: 'DAY-001',
    status: 'IN_TRANSIT',
    proNumber: 'PRO-DAY-001',
    bolNumber: 'BOL-DAY-001',
    shipper: {
      name: 'S', company: 'SCo',
      address1: '1 First St', address2: null,
      city: 'Dayton', state: 'OH',
      zipCode: '45402', country: 'US',
      phone: '+15555550111', email: null,
    },
    consignee: {
      name: 'C', company: 'CCo',
      address1: '2 Second St', address2: null,
      city: 'Cleveland', state: 'OH',
      zipCode: '44113', country: 'US',
      phone: null, email: null,
    },
    totalWeight: 1500,
    weightUnit: 'lb',
    serviceLevel: 'STD',
    reference: 'REF-DAY-001',
    createdDate: '2024-09-01T08:00:00Z',
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<DaytonTrackingResponse> = {},
): DaytonTrackingResponse {
  return {
    shipment: {
      proNumber: 'PRO-DAY-001',
      status: 'IT',
      activities: [
        {
          activityCode: 'PU',
          activityDescription: 'Picked up',
          activityDateTime: '2024-09-01T09:00:00Z',
          terminalCity: 'Dayton',
          terminalState: 'OH',
        },
        {
          activityCode: 'IT',
          activityDescription: 'In transit',
          activityDateTime: '2024-09-02T07:00:00Z',
          terminalCity: 'Columbus',
          terminalState: 'OH',
        },
      ],
    },
    ...overrides,
  }
}

function makeRate(overrides: Partial<DaytonRateQuote> = {}): DaytonRateQuote {
  return {
    quoteNumber: 'Q-DAY-1',
    serviceLevel: 'STD',
    serviceLevelDescription: 'Dayton Standard',
    totalCharges: 289.45,
    currency: 'USD',
    transitDays: 1,
    estimatedDeliveryDate: '2024-09-02',
    guaranteed: false,
    lineItems: null,
    ...overrides,
  }
}

describe('DaytonFreight transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('DAY-001')
    expect(r.carrierId).toBe('dayton-freight')
    expect(r.trackingNumber).toBe('PRO-DAY-001')
    expect(r.reference).toBe('BOL-DAY-001')
    expect(r.status).toBe('IN_TRANSIT')
  })

  it('maps addresses', () => {
    const r = transformShipment(makeShipment())
    expect(r.originAddress?.city).toBe('Dayton')
    expect(r.originAddress?.postalCode).toBe('45402')
    expect(r.destinationAddress?.city).toBe('Cleveland')
  })

  it('maps weight', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(1500)
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
      ['CANCELLED', 'CANCELLED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['ZZZ', 'UNKNOWN'],
    ]
    for (const [s, e] of cases) {
      expect(transformShipment(makeShipment({ status: s })).status).toBe(e)
    }
  })
})

describe('DaytonFreight transformTracking', () => {
  it('emits one event per activity', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps fields', () => {
    const e = transformTracking(makeTrackingResponse())[0]
    expect(e.carrierId).toBe('dayton-freight')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.location?.city).toBe('Dayton')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    transformTracking(makeTrackingResponse()).forEach((e) =>
      expect(e.metadata).toBeDefined(),
    )
  })

  it('fallback when shipment missing', () => {
    const events = transformTracking({ shipment: null })
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('maps all status codes', () => {
    const cases: [string, string][] = [
      ['PU', 'PRE_TRANSIT'],
      ['IT', 'IN_TRANSIT'],
      ['OFD', 'OUT_FOR_DELIVERY'],
      ['DEL', 'DELIVERED'],
      ['EXC', 'FAILURE'],
      ['HLD', 'UNKNOWN'],
      ['XX', 'UNKNOWN'],
    ]
    for (const [c, expected] of cases) {
      const r: DaytonTrackingResponse = {
        shipment: {
          proNumber: 'P', status: c,
          activities: [{
            activityCode: c, activityDescription: 'x',
            activityDateTime: '2024-09-01T00:00:00Z',
            terminalCity: null, terminalState: null,
          }],
        },
      }
      expect(transformTracking(r)[0].status).toBe(expected)
    }
  })
})

describe('DaytonFreight transformRate', () => {
  it('maps canonical fields', () => {
    const r = transformRate(makeRate())
    expect(r.id).toBe('Q-DAY-1')
    expect(r.carrierId).toBe('dayton-freight')
    expect(r.totalAmount).toBe(289.45)
    expect(r.transitDays).toBe(1)
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
