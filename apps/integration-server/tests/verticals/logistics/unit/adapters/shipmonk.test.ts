import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ShipmonkTrackingResponse,
  type ShipmonkTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/shipmonk/transform/tracking'
import {
  transformShipment,
  type ShipmonkShipment,
} from '../../../../../src/verticals/logistics/adapters/shipmonk/transform/shipment'
import {
  transformOrder,
  type ShipmonkOrder,
} from '../../../../../src/verticals/logistics/adapters/shipmonk/transform/order'

function makeEvent(overrides: Partial<ShipmonkTrackingEvent> = {}): ShipmonkTrackingEvent {
  return {
    type: 'Shipped',
    message: 'Shipped from facility',
    timestamp: '2024-03-15T10:30:00Z',
    city: 'Miami',
    state: 'FL',
    country: 'US',
    postal_code: '33101',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<ShipmonkTrackingResponse> = {}): ShipmonkTrackingResponse {
  return {
    shipment_id: 'sm-1',
    tracking_number: 'SM-TRK',
    events: [makeEvent({ type: 'Packed' }), makeEvent()],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ShipmonkShipment> = {}): ShipmonkShipment {
  return {
    id: 'sm-shp-1',
    tracking_number: 'SM-TRK',
    status: 'shipped',
    carrier: 'fedex',
    service_code: 'GROUND',
    weight: 4.0,
    weight_unit: 'lb',
    ship_from: { name: 'WH', city: 'Miami', country: 'US' },
    ship_to: { name: 'Bob', city: 'Atlanta', country: 'US' },
    label_url: 'https://shipmonk.com/l.pdf',
    reference: 'REF',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<ShipmonkOrder> = {}): ShipmonkOrder {
  return {
    id: 'sm-ord-1',
    order_number: 'SM-PO',
    status: 'pending',
    customer_id: 'c1',
    warehouse_id: 'w1',
    ship_to: { name: 'Bob', city: 'Atlanta', country: 'US' },
    ship_from: { name: 'WH', city: 'Miami', country: 'US' },
    items: [{ sku: 'Y', quantity: 4, name: 'Box', price: 5.5 }],
    shipment_ids: ['s1'],
    notes: 'Note',
    service_code: 'GROUND',
    ordered_at: '2024-03-15T00:00:00Z',
    created_at: '2024-03-15T08:00:00Z',
    updated_at: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

describe('ShipMonk transformTracking', () => {
  it('one event per tracking event', () => {
    expect(transformTracking(makeTracking())).toHaveLength(2)
  })

  it('maps fields', () => {
    const e = transformTracking(makeTracking())[1]
    expect(e.carrierId).toBe('shipmonk')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Miami')
  })

  it('passes metadata', () => {
    transformTracking(makeTracking()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('fallback when empty', () => {
    expect(transformTracking(makeTracking({ events: [] }))[0].status).toBe('UNKNOWN')
  })

  it('maps WMS statuses', () => {
    const cases: [string, string][] = [
      ['Order Received', 'PRE_TRANSIT'],
      ['Picked', 'PRE_TRANSIT'],
      ['Packed', 'PRE_TRANSIT'],
      ['Shipped', 'IN_TRANSIT'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'FAILURE'],
      ['idk', 'UNKNOWN'],
    ]
    for (const [s, e] of cases) {
      expect(transformTracking(makeTracking({ events: [makeEvent({ type: s })] }))[0].status).toBe(e)
    }
  })
})

describe('ShipMonk transformShipment', () => {
  it('maps fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('sm-shp-1')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.carrierId).toBe('fedex')
  })

  it('maps weight', () => {
    expect(transformShipment(makeShipment()).totalWeight?.value).toBe(4.0)
  })

  it('passes metadata', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing fields', () => {
    const r = transformShipment(makeShipment({ weight: null, ship_from: null, ship_to: null, status: null }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
})

describe('ShipMonk transformOrder', () => {
  it('maps fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('sm-ord-1')
    expect(r.orderNumber).toBe('SM-PO')
    expect(r.status).toBe('PENDING')
  })

  it('maps lineItems', () => {
    expect(transformOrder(makeOrder()).lineItems?.[0].sku).toBe('Y')
  })

  it('maps shipmentIds', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['s1'])
  })

  it('passes metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
