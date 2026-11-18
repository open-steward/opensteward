import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ShipheroTrackingResponse,
  type ShipheroTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/shiphero/transform/tracking'
import {
  transformShipment,
  type ShipheroShipment,
} from '../../../../../src/verticals/logistics/adapters/shiphero/transform/shipment'
import {
  transformOrder,
  type ShipheroOrder,
} from '../../../../../src/verticals/logistics/adapters/shiphero/transform/order'

function makeEvent(overrides: Partial<ShipheroTrackingEvent> = {}): ShipheroTrackingEvent {
  return {
    status: 'Shipped',
    description: 'Package shipped',
    date: '2024-03-15T10:30:00Z',
    city: 'Austin',
    state: 'TX',
    country: 'US',
    zip: '78701',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<ShipheroTrackingResponse> = {}): ShipheroTrackingResponse {
  return {
    shipment_id: 'sh-1',
    tracking_number: 'SH-TRK',
    events: [makeEvent({ status: 'Picked' }), makeEvent()],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ShipheroShipment> = {}): ShipheroShipment {
  return {
    id: 'sh-shp-1',
    tracking_number: 'SH-TRK',
    status: 'shipped',
    carrier: 'usps',
    shipping_method: 'PRIORITY',
    total_weight: 16,
    weight_unit: 'oz',
    shipping_address: { name: 'Bob', city: 'Austin', country: 'US' },
    warehouse_address: { name: 'WH', city: 'Dallas', country: 'US' },
    label_url: 'https://shiphero.com/l.pdf',
    reference: 'REF',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<ShipheroOrder> = {}): ShipheroOrder {
  return {
    id: 'sh-ord-1',
    order_number: 'SH-PO-1',
    fulfillment_status: 'pending',
    customer_id: 'cust-1',
    warehouse_id: 'wh-1',
    shipping_address: { name: 'Bob', city: 'Austin', country: 'US' },
    warehouse_address: { name: 'WH', city: 'Dallas', country: 'US' },
    line_items: [{ sku: 'X', quantity: 1, product_name: 'Thing', price: 19.99 }],
    shipment_ids: ['s1', 's2'],
    notes: 'Note',
    required_ship_method: 'PRIORITY',
    order_date: '2024-03-15T00:00:00Z',
    created_at: '2024-03-15T08:00:00Z',
    updated_at: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

describe('ShipHero transformTracking', () => {
  it('one event per tracking event', () => {
    expect(transformTracking(makeTracking())).toHaveLength(2)
  })

  it('maps fields', () => {
    const e = transformTracking(makeTracking())[1]
    expect(e.carrierId).toBe('shiphero')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Austin')
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
      ['nope', 'UNKNOWN'],
    ]
    for (const [s, e] of cases) {
      expect(transformTracking(makeTracking({ events: [makeEvent({ status: s })] }))[0].status).toBe(e)
    }
  })
})

describe('ShipHero transformShipment', () => {
  it('maps fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('sh-shp-1')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.carrierId).toBe('usps')
  })

  it('maps weight', () => {
    expect(transformShipment(makeShipment()).totalWeight?.unit).toBe('oz')
  })

  it('passes metadata', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing fields', () => {
    const r = transformShipment(makeShipment({ total_weight: null, shipping_address: null, warehouse_address: null, status: null }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
})

describe('ShipHero transformOrder', () => {
  it('maps fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('sh-ord-1')
    expect(r.orderNumber).toBe('SH-PO-1')
    expect(r.status).toBe('PENDING')
  })

  it('maps lineItems', () => {
    expect(transformOrder(makeOrder()).lineItems?.[0].sku).toBe('X')
  })

  it('maps shipmentIds', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['s1', 's2'])
  })

  it('passes metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
