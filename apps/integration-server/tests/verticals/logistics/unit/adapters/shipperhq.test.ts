import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ShipperhqTrackingResponse,
  type ShipperhqTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/shipperhq/transform/tracking'
import {
  transformShipment,
  type ShipperhqShipment,
} from '../../../../../src/verticals/logistics/adapters/shipperhq/transform/shipment'
import {
  transformOrder,
  type ShipperhqOrder,
} from '../../../../../src/verticals/logistics/adapters/shipperhq/transform/order'

function makeEvent(overrides: Partial<ShipperhqTrackingEvent> = {}): ShipperhqTrackingEvent {
  return {
    status: 'Shipped',
    description: 'In transit',
    occurredAt: '2024-03-15T10:30:00Z',
    city: 'Denver',
    state: 'CO',
    country: 'US',
    postalCode: '80201',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<ShipperhqTrackingResponse> = {}): ShipperhqTrackingResponse {
  return {
    shipmentId: 'shq-1',
    trackingNumber: 'SHQ-TRK',
    events: [makeEvent({ status: 'Order Received' }), makeEvent()],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ShipperhqShipment> = {}): ShipperhqShipment {
  return {
    id: 'shq-shp-1',
    trackingNumber: 'SHQ-TRK',
    status: 'shipped',
    carrierCode: 'dhl',
    serviceCode: 'EXPRESS',
    weight: 1.5,
    weightUnit: 'kg',
    origin: { name: 'WH', city: 'Denver', country: 'US' },
    destination: { name: 'Bob', city: 'Seattle', country: 'US' },
    labelUrl: 'https://shipperhq.com/l.pdf',
    reference: 'REF',
    createdAt: '2024-03-15T09:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<ShipperhqOrder> = {}): ShipperhqOrder {
  return {
    id: 'shq-ord-1',
    orderNumber: 'SHQ-PO',
    status: 'pending',
    customerId: 'c1',
    warehouseId: 'w1',
    destination: { name: 'Bob', city: 'Seattle', country: 'US' },
    origin: { name: 'WH', city: 'Denver', country: 'US' },
    items: [{ sku: 'Z', quantity: 1, name: 'Item', price: 100 }],
    shipmentIds: ['s1', 's2'],
    notes: 'Note',
    serviceCode: 'EXPRESS',
    orderedAt: '2024-03-15T00:00:00Z',
    createdAt: '2024-03-15T08:00:00Z',
    updatedAt: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

describe('ShipperHQ transformTracking', () => {
  it('one event per tracking event', () => {
    expect(transformTracking(makeTracking())).toHaveLength(2)
  })

  it('maps fields', () => {
    const e = transformTracking(makeTracking())[1]
    expect(e.carrierId).toBe('shipperhq')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Denver')
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
      ['huh', 'UNKNOWN'],
    ]
    for (const [s, e] of cases) {
      expect(transformTracking(makeTracking({ events: [makeEvent({ status: s })] }))[0].status).toBe(e)
    }
  })
})

describe('ShipperHQ transformShipment', () => {
  it('maps fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('shq-shp-1')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.carrierId).toBe('dhl')
  })

  it('maps weight', () => {
    expect(transformShipment(makeShipment()).totalWeight?.unit).toBe('kg')
  })

  it('passes metadata', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing fields', () => {
    const r = transformShipment(makeShipment({ weight: null, origin: null, destination: null, status: null }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
})

describe('ShipperHQ transformOrder', () => {
  it('maps fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('shq-ord-1')
    expect(r.orderNumber).toBe('SHQ-PO')
    expect(r.status).toBe('PENDING')
  })

  it('maps lineItems', () => {
    expect(transformOrder(makeOrder()).lineItems?.[0].sku).toBe('Z')
  })

  it('maps shipmentIds', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['s1', 's2'])
  })

  it('passes metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
