import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ExtensivTrackingResponse,
  type ExtensivTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/extensiv/transform/tracking'
import {
  transformShipment,
  type ExtensivShipment,
} from '../../../../../src/verticals/logistics/adapters/extensiv/transform/shipment'
import {
  transformOrder,
  type ExtensivOrder,
} from '../../../../../src/verticals/logistics/adapters/extensiv/transform/order'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ExtensivTrackingEvent> = {}): ExtensivTrackingEvent {
  return {
    eventType: 'Shipped',
    description: 'Package shipped',
    occurredAt: '2024-03-15T10:30:00Z',
    city: 'Los Angeles',
    state: 'CA',
    country: 'US',
    postalCode: '90001',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<ExtensivTrackingResponse> = {}): ExtensivTrackingResponse {
  return {
    orderId: 12345,
    trackingNumber: 'EXT-TRK-001',
    events: [
      makeEvent({ eventType: 'Order Received', description: 'Received' }),
      makeEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ExtensivShipment> = {}): ExtensivShipment {
  return {
    shipmentId: 'shp-ext-001',
    trackingNumber: 'EXT-TRK-001',
    status: 'Shipped',
    carrier: 'fedex',
    serviceCode: 'GROUND',
    weight: 5.5,
    weightUnit: 'lb',
    shipFromAddress: { name: 'Warehouse', city: 'LA', country: 'US' },
    shipToAddress: { name: 'Bob', city: 'NYC', country: 'US' },
    labelUrl: 'https://secure-wms.com/labels/1.pdf',
    reference: 'REF-1',
    createdAt: '2024-03-15T09:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<ExtensivOrder> = {}): ExtensivOrder {
  return {
    orderId: 9999,
    referenceNum: 'PO-001',
    status: 'Open',
    customerId: 1,
    warehouseId: 2,
    shipToAddress: { name: 'Bob', city: 'NYC', country: 'US' },
    shipFromAddress: { name: 'WH', city: 'LA', country: 'US' },
    items: [{ sku: 'SKU1', quantity: 2, description: 'Widget', unitPrice: 9.99 }],
    shipmentIds: [101, 102],
    notes: 'Handle with care',
    requestedServiceCode: 'GROUND',
    orderDate: '2024-03-15T00:00:00Z',
    createdAt: '2024-03-15T09:00:00Z',
    updatedAt: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('Extensiv transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTracking())).toHaveLength(2)
  })

  it('maps fields to canonical', () => {
    const e = transformTracking(makeTracking())[1]
    expect(e.trackingNumber).toBe('EXT-TRK-001')
    expect(e.carrierId).toBe('extensiv')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Los Angeles')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('passes metadata through', () => {
    transformTracking(makeTracking()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits fallback when no events', () => {
    const r = transformTracking(makeTracking({ events: [] }))
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('UNKNOWN')
  })

  it('maps WMS event types', () => {
    const cases: [string, string][] = [
      ['Order Received', 'PRE_TRANSIT'],
      ['Picked', 'PRE_TRANSIT'],
      ['Packed', 'PRE_TRANSIT'],
      ['Shipped', 'IN_TRANSIT'],
      ['Out for Delivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'FAILURE'],
      ['unknown_event', 'UNKNOWN'],
    ]
    for (const [t, expected] of cases) {
      const r = transformTracking(makeTracking({ events: [makeEvent({ eventType: t })] }))
      expect(r[0].status).toBe(expected)
    }
  })
})

describe('Extensiv transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('shp-ext-001')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.trackingNumber).toBe('EXT-TRK-001')
    expect(r.carrierId).toBe('fedex')
    expect(r.serviceCode).toBe('GROUND')
  })

  it('maps weight', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(5.5)
    expect(r.totalWeight?.unit).toBe('lb')
  })

  it('maps addresses', () => {
    const r = transformShipment(makeShipment())
    expect(r.originAddress?.city).toBe('LA')
    expect(r.destinationAddress?.city).toBe('NYC')
  })

  it('passes metadata', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing fields', () => {
    const r = transformShipment(makeShipment({
      weight: null, weightUnit: null, labelUrl: null,
      shipFromAddress: null, shipToAddress: null,
      serviceCode: null, status: null, reference: null,
      createdAt: null, updatedAt: null, trackingNumber: null,
    }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.originAddress).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
})

describe('Extensiv transformOrder', () => {
  it('maps canonical fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('9999')
    expect(r.orderNumber).toBe('PO-001')
    expect(r.status).toBe('PENDING')
    expect(r.customerId).toBe('1')
    expect(r.warehouseId).toBe('2')
  })

  it('maps lineItems', () => {
    const r = transformOrder(makeOrder())
    expect(r.lineItems).toHaveLength(1)
    expect(r.lineItems?.[0].sku).toBe('SKU1')
    expect(r.lineItems?.[0].quantity).toBe(2)
  })

  it('maps shipmentIds as strings', () => {
    const r = transformOrder(makeOrder())
    expect(r.shipmentIds).toEqual(['101', '102'])
  })

  it('passes metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
