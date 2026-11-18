import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type PostNordTrackingResponse,
  type PostNordTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/postnord/transform/tracking'
import {
  transformShipment,
  type PostNordShipment,
} from '../../../../../src/verticals/logistics/adapters/postnord/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<PostNordTrackingEvent> = {}): PostNordTrackingEvent {
  return {
    eventCode: 'EN_ROUTE',
    status: 'EN_ROUTE',
    description: 'Item is in transit',
    eventTime: '2024-03-15T10:30:00Z',
    location: {
      displayName: 'Stockholm Terminal',
      city: 'Stockholm',
      country: 'SE',
      postcode: '11122',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: { shipmentId?: string; itemId?: string; status?: string | null; events?: PostNordTrackingEvent[] } = {}): PostNordTrackingResponse {
  return {
    TrackingInformationResponse: {
      shipments: [
        {
          shipmentId: overrides.shipmentId ?? 'PN123456789SE',
          status: overrides.status ?? 'EN_ROUTE',
          items: [
            {
              itemId: overrides.itemId ?? 'PN123456789SE',
              status: overrides.status ?? 'EN_ROUTE',
              events: overrides.events ?? [
                makeTrackingEvent({ eventCode: 'INFORMED', status: 'INFORMED', description: 'Pre-advised' }),
                makeTrackingEvent(),
              ],
            },
          ],
        },
      ],
    },
  }
}

function makeShipment(overrides: Partial<PostNordShipment> = {}): PostNordShipment {
  return {
    shipmentId: 'shp-pn-001',
    itemId: 'PN123456789SE',
    status: 'EN_ROUTE',
    serviceCode: 'MYPACK_HOME',
    weight: 3.2,
    weightUnit: 'kg',
    sender: {
      name: 'Anna Andersson',
      street1: 'Drottninggatan 1',
      city: 'Stockholm',
      postalCode: '11122',
      country: 'SE',
    },
    recipient: {
      name: 'Erik Nilsson',
      street1: 'Avenyn 5',
      city: 'Gothenburg',
      postalCode: '41136',
      country: 'SE',
    },
    labelUrl: 'https://api.postnord.com/labels/shp-pn-001.pdf',
    reference: 'REF-PN-001',
    createdAt: '2024-03-15T09:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('PostNord transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.shipmentId).toBe('PN123456789SE')
    expect(event.trackingNumber).toBe('PN123456789SE')
    expect(event.carrierId).toBe('postnord')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Pre-advised')
    expect(event.location?.city).toBe('Stockholm')
    expect(event.location?.country).toBe('SE')
    expect(event.location?.postalCode).toBe('11122')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTrackingResponse({ events: [], status: 'INFORMED' })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('PRE_TRANSIT')
  })

  it('handles null location gracefully', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ location: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all event codes correctly', () => {
    const cases: [string, string][] = [
      ['INFORMED', 'PRE_TRANSIT'],
      ['EN_ROUTE', 'PRE_TRANSIT'],
      ['DELIVERY', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['AVAILABLE_FOR_DELIVERY', 'AVAILABLE_FOR_PICKUP'],
      ['DELIVERY_REFUSED', 'FAILURE'],
      ['STOPPED', 'FAILURE'],
      ['EXCEPTION', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [eventCode, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ eventCode, status: null })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })

  it('handles multiple shipments and items', () => {
    const raw: PostNordTrackingResponse = {
      TrackingInformationResponse: {
        shipments: [
          {
            shipmentId: 'SHIP1',
            status: 'EN_ROUTE',
            items: [
              { itemId: 'ITEM1A', status: 'EN_ROUTE', events: [makeTrackingEvent()] },
              { itemId: 'ITEM1B', status: 'DELIVERED', events: [makeTrackingEvent({ eventCode: 'DELIVERED' })] },
            ],
          },
        ],
      },
    }
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
    expect(events[0].trackingNumber).toBe('ITEM1A')
    expect(events[1].trackingNumber).toBe('ITEM1B')
    expect(events[1].status).toBe('DELIVERED')
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('PostNord transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-pn-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('PN123456789SE')
    expect(result.carrierId).toBe('postnord')
    expect(result.serviceCode).toBe('MYPACK_HOME')
    expect(result.reference).toBe('REF-PN-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Anna Andersson')
    expect(result.originAddress?.city).toBe('Stockholm')
    expect(result.destinationAddress?.name).toBe('Erik Nilsson')
    expect(result.destinationAddress?.city).toBe('Gothenburg')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(3.2)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null,
      weightUnit: null,
      labelUrl: null,
      sender: null,
      recipient: null,
      serviceCode: null,
      status: null,
      reference: null,
      createdAt: null,
      updatedAt: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['CREATED', 'LABEL_CREATED'],
      ['INFORMED', 'LABEL_CREATED'],
      ['EN_ROUTE', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['AVAILABLE_FOR_DELIVERY', 'IN_TRANSIT'],
      ['STOPPED', 'EXCEPTION'],
      ['EXCEPTION', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
