import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type LogiwaTrackingResponse,
  type LogiwaTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/logiwa/transform/tracking'
import {
  transformShipment,
  type LogiwaShipment,
} from '../../../../../src/verticals/logistics/adapters/logiwa/transform/shipment'
import {
  transformOrder,
  type LogiwaOrder,
} from '../../../../../src/verticals/logistics/adapters/logiwa/transform/order'

function makeEvent(overrides: Partial<LogiwaTrackingEvent> = {}): LogiwaTrackingEvent {
  return {
    Status: 'Shipped',
    Description: 'Shipped from warehouse',
    EventDate: '2024-03-15T10:30:00Z',
    City: 'Chicago',
    State: 'IL',
    Country: 'US',
    PostalCode: '60601',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<LogiwaTrackingResponse> = {}): LogiwaTrackingResponse {
  return {
    ShipmentID: 555,
    TrackingNumber: 'LGW-1',
    Events: [makeEvent({ Status: 'Picked' }), makeEvent()],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<LogiwaShipment> = {}): LogiwaShipment {
  return {
    ShipmentID: 'shp-lgw-1',
    TrackingNumber: 'LGW-1',
    Status: 'Shipped',
    Carrier: 'ups',
    ServiceCode: 'GROUND',
    Weight: 2.0,
    WeightUnit: 'kg',
    ShipFromAddress: { name: 'WH', city: 'Chicago', country: 'US' },
    ShipToAddress: { name: 'Bob', city: 'Boston', country: 'US' },
    LabelUrl: 'https://logiwa.com/l.pdf',
    Reference: 'REF',
    CreatedAt: '2024-03-15T09:00:00Z',
    UpdatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<LogiwaOrder> = {}): LogiwaOrder {
  return {
    OrderID: 1234,
    OrderCode: 'PO-LGW',
    Status: 'New',
    CustomerID: 99,
    WarehouseID: 7,
    ShipToAddress: { name: 'Bob', city: 'Boston', country: 'US' },
    ShipFromAddress: { name: 'WH', city: 'Chicago', country: 'US' },
    Items: [{ SKU: 'A', Quantity: 3, Description: 'Item', UnitPrice: 12.5 }],
    ShipmentIDs: [1, 2],
    Notes: 'Rush',
    ServiceCode: 'GROUND',
    OrderDate: '2024-03-15T00:00:00Z',
    CreatedAt: '2024-03-15T08:00:00Z',
    UpdatedAt: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

describe('Logiwa transformTracking', () => {
  it('one event per tracking event', () => {
    expect(transformTracking(makeTracking())).toHaveLength(2)
  })

  it('maps fields', () => {
    const e = transformTracking(makeTracking())[1]
    expect(e.carrierId).toBe('logiwa')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Chicago')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('passes metadata', () => {
    transformTracking(makeTracking()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('fallback when empty', () => {
    expect(transformTracking(makeTracking({ Events: [] }))[0].status).toBe('UNKNOWN')
  })

  it('maps WMS statuses', () => {
    const cases: [string, string][] = [
      ['Order Received', 'PRE_TRANSIT'],
      ['Picked', 'PRE_TRANSIT'],
      ['Packed', 'PRE_TRANSIT'],
      ['Shipped', 'IN_TRANSIT'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'FAILURE'],
      ['weird', 'UNKNOWN'],
    ]
    for (const [s, e] of cases) {
      expect(transformTracking(makeTracking({ Events: [makeEvent({ Status: s })] }))[0].status).toBe(e)
    }
  })
})

describe('Logiwa transformShipment', () => {
  it('maps fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('shp-lgw-1')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.trackingNumber).toBe('LGW-1')
    expect(r.carrierId).toBe('ups')
  })

  it('maps weight', () => {
    expect(transformShipment(makeShipment()).totalWeight?.unit).toBe('kg')
  })

  it('passes metadata', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing fields', () => {
    const r = transformShipment(makeShipment({ Weight: null, ShipFromAddress: null, ShipToAddress: null, Status: null }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
})

describe('Logiwa transformOrder', () => {
  it('maps fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('1234')
    expect(r.orderNumber).toBe('PO-LGW')
    expect(r.status).toBe('PENDING')
  })

  it('maps lineItems', () => {
    expect(transformOrder(makeOrder()).lineItems?.[0].sku).toBe('A')
  })

  it('maps shipmentIds', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['1', '2'])
  })

  it('passes metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
