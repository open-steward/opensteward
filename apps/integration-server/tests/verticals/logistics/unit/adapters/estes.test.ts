import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type EstesPickupRequest,
} from '../../../../../src/verticals/logistics/adapters/estes/transform/shipment'
import {
  transformTracking,
  type EstesTrackingResponse,
} from '../../../../../src/verticals/logistics/adapters/estes/transform/tracking'
import { transformRate, type EstesRateQuote } from '../../../../../src/verticals/logistics/adapters/estes/transform/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makePickupRequest(overrides: Partial<EstesPickupRequest> = {}): EstesPickupRequest {
  return {
    requestNumber: 'PKR-EST-001',
    status: 'IN_TRANSIT',
    proNumber: 'PRO1234567',
    bolNumber: 'BOL-001',
    shipper: {
      name: 'Mike Shipper',
      company: 'Shipper Inc',
      addressLine1: '500 Industrial Blvd',
      addressLine2: 'Dock 3',
      city: 'Richmond',
      state: 'VA',
      postalCode: '23219',
      country: 'US',
      phone: '+18045551234',
      email: 'mike@example.com',
    },
    consignee: {
      name: 'Jane Consignee',
      company: 'Consignee Corp',
      addressLine1: '200 Commerce Dr',
      addressLine2: null,
      city: 'Atlanta',
      state: 'GA',
      postalCode: '30301',
      country: 'US',
      phone: '+14045555678',
      email: 'jane@example.com',
    },
    totalWeight: 1500,
    weightUnit: 'lb',
    totalPieces: 4,
    serviceLevel: 'LTL',
    reference: 'REF-EST-001',
    pickupDate: '2024-06-01',
    createdDate: '2024-05-30T14:00:00Z',
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<EstesTrackingResponse> = {},
): EstesTrackingResponse {
  return {
    data: [
      {
        pro: 'PRO1234567',
        status: 'I',
        statusDescription: 'In transit',
        events: [
          {
            statusCode: 'P',
            statusDescription: 'Picked up from shipper',
            date: '2024-06-01',
            time: '08:00:00',
            location: 'Richmond Terminal',
            city: 'Richmond',
            state: 'VA',
          },
          {
            statusCode: 'I',
            statusDescription: 'In transit to destination',
            date: '2024-06-02',
            time: '06:00:00',
            location: 'Charlotte Hub',
            city: 'Charlotte',
            state: 'NC',
          },
        ],
        deliveryDate: null,
        deliveryTime: null,
        appointmentDate: null,
        receivedBy: null,
      },
    ],
    ...overrides,
  }
}

function makeRateQuote(overrides: Partial<EstesRateQuote> = {}): EstesRateQuote {
  return {
    quoteNumber: 'QT-12345',
    serviceLevel: 'LTL',
    serviceLevelDescription: 'LTL Standard',
    totalCharges: 350.00,
    currency: 'USD',
    transitDays: 3,
    deliveryDate: '2024-06-04',
    guaranteed: false,
    discountAmount: 25.00,
    ...overrides,
  }
}

// ─── transformShipment ───────────────────────────────────────────────────────

describe('Estes transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makePickupRequest()
    const result = transformShipment(raw)

    expect(result.id).toBe('PKR-EST-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('PRO1234567')
    expect(result.carrierId).toBe('estes')
    expect(result.serviceCode).toBe('LTL')
    expect(result.reference).toBe('BOL-001')
    expect(result.notes).toBe('REF-EST-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makePickupRequest()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Mike Shipper')
    expect(result.originAddress?.city).toBe('Richmond')
    expect(result.originAddress?.state).toBe('VA')
    expect(result.destinationAddress?.name).toBe('Jane Consignee')
    expect(result.destinationAddress?.city).toBe('Atlanta')
    expect(result.destinationAddress?.state).toBe('GA')
  })

  it('maps weight (LTL uses lb)', () => {
    const raw = makePickupRequest()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(1500)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('passes through metadata unmodified', () => {
    const raw = makePickupRequest()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makePickupRequest({
      totalWeight: null,
      shipper: null,
      consignee: null,
      proNumber: null,
      bolNumber: null,
      reference: null,
      serviceLevel: null,
      createdDate: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['CREATED', 'PENDING'],
      ['PENDING', 'PENDING'],
      ['SCHEDULED', 'PENDING'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['OTHER', 'UNKNOWN'],
    ]
    for (const [estesStatus, expected] of cases) {
      const raw = makePickupRequest({ status: estesStatus })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })

  it('falls back to reference when bolNumber is null', () => {
    const raw = makePickupRequest({ bolNumber: null, reference: 'FALLBACK-REF' })
    expect(transformShipment(raw).reference).toBe('FALLBACK-REF')
  })
})

// ─── transformTracking ───────────────────────────────────────────────────────

describe('Estes transformTracking', () => {
  it('produces one event per history entry', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'PRO1234567')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw, 'PRO1234567')[0]

    expect(event.trackingNumber).toBe('PRO1234567')
    expect(event.carrierId).toBe('estes')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Picked up from shipper')
    expect(event.location?.city).toBe('Richmond')
    expect(event.location?.state).toBe('VA')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'PRO1234567')
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when data is empty', () => {
    const raw = makeTrackingResponse({ data: [] })
    const events = transformTracking(raw, 'PRO1234567')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('PRO1234567')
  })

  it('emits a single fallback event when events is empty', () => {
    const raw: EstesTrackingResponse = {
      data: [
        {
          pro: 'PRO1234567',
          status: 'I',
          statusDescription: 'In transit',
          events: [],
          deliveryDate: null,
          deliveryTime: null,
          appointmentDate: null,
          receivedBy: null,
        },
      ],
    }
    const events = transformTracking(raw, 'PRO1234567')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('maps status codes correctly', () => {
    const cases: [string, string][] = [
      ['P', 'PRE_TRANSIT'],
      ['I', 'IN_TRANSIT'],
      ['O', 'OUT_FOR_DELIVERY'],
      ['D', 'DELIVERED'],
      ['X', 'FAILURE'],
      ['A', 'IN_TRANSIT'],
      ['Z', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw: EstesTrackingResponse = {
        data: [
          {
            pro: 'PRO1234567',
            status: code,
            statusDescription: 'test',
            events: [
              {
                statusCode: code,
                statusDescription: 'test',
                date: '2024-06-01',
                time: '08:00:00',
                location: null,
                city: null,
                state: null,
              },
            ],
            deliveryDate: null,
            deliveryTime: null,
            appointmentDate: null,
            receivedBy: null,
          },
        ],
      }
      expect(transformTracking(raw, 'PRO1234567')[0].status).toBe(expected)
    }
  })

  it('handles null location fields gracefully', () => {
    const raw: EstesTrackingResponse = {
      data: [
        {
          pro: 'PRO1234567',
          status: 'I',
          statusDescription: 'In transit',
          events: [
            {
              statusCode: 'I',
              statusDescription: 'In transit',
              date: '2024-06-02',
              time: '06:00:00',
              location: null,
              city: null,
              state: null,
            },
          ],
          deliveryDate: null,
          deliveryTime: null,
          appointmentDate: null,
          receivedBy: null,
        },
      ],
    }
    expect(transformTracking(raw, 'PRO1234567')[0].location).toBeUndefined()
  })
})

// ─── transformRate ───────────────────────────────────────────────────────────

describe('Estes transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateQuote()
    const result = transformRate(raw)

    expect(result.id).toBe('QT-12345')
    expect(result.carrierId).toBe('estes')
    expect(result.serviceCode).toBe('LTL')
    expect(result.serviceName).toBe('LTL Standard')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(350.00)
    expect(result.transitDays).toBe(3)
    expect(result.deliveryDays).toBe(3)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.isGuaranteedDelivery).toBe(false)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateQuote()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = makeRateQuote({
      transitDays: null,
      deliveryDate: null,
      guaranteed: null,
    })
    const result = transformRate(raw)

    expect(result.transitDays).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
    expect(result.isGuaranteedDelivery).toBeUndefined()
  })

  it('defaults currency to USD', () => {
    const raw = makeRateQuote()
    expect(transformRate(raw).currency).toBe('USD')
  })
})
