import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type TntShipment,
} from '../../../../../src/verticals/logistics/adapters/tnt/transform/shipment'
import { transformTracking, type TntTracking } from '../../../../../src/verticals/logistics/adapters/tnt/transform/tracking'
import { transformRate, type TntRateOption } from '../../../../../src/verticals/logistics/adapters/tnt/transform/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<TntShipment> = {}): TntShipment {
  return {
    consignmentNumber: 'TNT123456789',
    status: 'DP',
    sender: {
      name: 'John Sender',
      addressLine1: '100 Oxford St',
      addressLine2: 'Floor 3',
      addressLine3: null,
      city: 'London',
      province: 'LND',
      postcode: 'W1D 1LL',
      country: 'GB',
      phone: '+442012345678',
      email: 'john@example.com',
      companyName: 'Sender Ltd',
    },
    receiver: {
      name: 'Pierre Receiver',
      addressLine1: '5 Rue de Rivoli',
      addressLine2: null,
      addressLine3: null,
      city: 'Paris',
      province: 'IDF',
      postcode: '75001',
      country: 'FR',
      phone: '+33123456789',
      email: 'pierre@example.com',
      companyName: 'Receiver SARL',
    },
    pieces: [
      { sequenceNumber: 1, weight: 5.0, length: 50, width: 40, height: 30 },
    ],
    totalWeight: 5.0,
    weightUnit: 'kg',
    dimensionUnit: 'cm',
    service: 'Express',
    serviceCode: '15N',
    reference: 'REF-TNT-001',
    labelUrl: 'https://express.tnt.com/labels/TNT123456789.pdf',
    createdDate: '2024-05-01T09:00:00Z',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<TntTracking> = {}): TntTracking {
  return {
    consignmentNumber: 'TNT123456789',
    status: 'DP',
    statusDescription: 'Departed depot',
    events: [
      {
        statusCode: 'CN',
        statusDescription: 'Collected from sender',
        dateTime: '2024-05-01T10:00:00Z',
        depot: 'LHR',
        depotName: 'London Heathrow',
        signatory: null,
      },
      {
        statusCode: 'DP',
        statusDescription: 'Departed depot',
        dateTime: '2024-05-01T18:00:00Z',
        depot: 'CDG',
        depotName: 'Paris CDG Hub',
        signatory: null,
      },
    ],
    deliveryDate: null,
    deliverySignatory: null,
    ...overrides,
  }
}

function makeRateOption(overrides: Partial<TntRateOption> = {}): TntRateOption {
  return {
    service: 'Express',
    serviceCode: '15N',
    serviceName: 'TNT Express by 9:00',
    currency: 'EUR',
    totalPrice: 45.99,
    transitDays: 1,
    deliveryDate: '2024-05-02',
    guaranteed: true,
    ...overrides,
  }
}

// ─── transformShipment ───────────────────────────────────────────────────────

describe('TNT transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('TNT123456789')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('TNT123456789')
    expect(result.carrierId).toBe('tnt')
    expect(result.serviceCode).toBe('15N')
    expect(result.reference).toBe('REF-TNT-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('John Sender')
    expect(result.originAddress?.city).toBe('London')
    expect(result.originAddress?.country).toBe('GB')
    expect(result.destinationAddress?.name).toBe('Pierre Receiver')
    expect(result.destinationAddress?.city).toBe('Paris')
    expect(result.destinationAddress?.country).toBe('FR')
  })

  it('maps weight and dimensions from first piece', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(5.0)
    expect(result.totalWeight?.unit).toBe('kg')
    expect(result.dimensions?.length).toBe(50)
    expect(result.dimensions?.width).toBe(40)
    expect(result.dimensions?.height).toBe(30)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      totalWeight: null,
      pieces: null,
      sender: null,
      receiver: null,
      reference: null,
      labelUrl: null,
      createdDate: null,
      serviceCode: null,
      service: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['CN', 'PENDING'],
      ['CREATED', 'PENDING'],
      ['AR', 'IN_TRANSIT'],
      ['DP', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OD', 'OUT_FOR_DELIVERY'],
      ['OK', 'DELIVERED'],
      ['DELIVERED', 'DELIVERED'],
      ['RT', 'RETURNED'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['EX', 'EXCEPTION'],
      ['EXCEPTION', 'EXCEPTION'],
      ['OTHER', 'UNKNOWN'],
    ]
    for (const [tntStatus, expected] of cases) {
      const raw = makeShipment({ status: tntStatus })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})

// ─── transformTracking ───────────────────────────────────────────────────────

describe('TNT transformTracking', () => {
  it('produces one event per history entry', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'TNT123456789')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'TNT123456789')[0]

    expect(event.trackingNumber).toBe('TNT123456789')
    expect(event.carrierId).toBe('tnt')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Collected from sender')
    expect(event.location?.city).toBe('London Heathrow')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'TNT123456789')
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTracking({ events: [] })
    const events = transformTracking(raw, 'TNT123456789')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('TNT123456789')
  })

  it('maps status codes correctly', () => {
    const cases: [string, string][] = [
      ['CN', 'PRE_TRANSIT'],
      ['AR', 'IN_TRANSIT'],
      ['DP', 'IN_TRANSIT'],
      ['OD', 'OUT_FOR_DELIVERY'],
      ['OK', 'DELIVERED'],
      ['EX', 'FAILURE'],
      ['RT', 'RETURN_TO_SENDER'],
      ['XX', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeTracking({
        events: [
          {
            statusCode: code,
            statusDescription: 'test',
            dateTime: '2024-05-01T10:00:00Z',
            depot: null,
            depotName: null,
            signatory: null,
          },
        ],
      })
      expect(transformTracking(raw, 'TNT123456789')[0].status).toBe(expected)
    }
  })

  it('handles null depotName gracefully', () => {
    const raw = makeTracking({
      events: [
        {
          statusCode: 'DP',
          statusDescription: 'Departed',
          dateTime: '2024-05-01T18:00:00Z',
          depot: 'CDG',
          depotName: null,
          signatory: null,
        },
      ],
    })
    expect(transformTracking(raw, 'TNT123456789')[0].location).toBeUndefined()
  })
})

// ─── transformRate ───────────────────────────────────────────────────────────

describe('TNT transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateOption()
    const result = transformRate(raw)

    expect(result.id).toBe('15N')
    expect(result.carrierId).toBe('tnt')
    expect(result.serviceCode).toBe('15N')
    expect(result.serviceName).toBe('TNT Express by 9:00')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(45.99)
    expect(result.transitDays).toBe(1)
    expect(result.deliveryDays).toBe(1)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.isGuaranteedDelivery).toBe(true)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateOption()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const raw = makeRateOption({
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
})
