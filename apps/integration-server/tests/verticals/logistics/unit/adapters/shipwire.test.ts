import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ShipwireTrackingResponse,
  type ShipwireTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/shipwire/transform/tracking'
import {
  transformOrder,
  type ShipwireOrder,
} from '../../../../../src/verticals/logistics/adapters/shipwire/transform/order'
import {
  transformWarehouse,
  type ShipwireWarehouse,
} from '../../../../../src/verticals/logistics/adapters/shipwire/transform/warehouse'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<ShipwireTrackingEvent> = {}): ShipwireTrackingEvent {
  return {
    status: 'in_transit',
    description: 'Shipment in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Chicago, IL',
    carrier: 'USPS',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<ShipwireTrackingResponse> = {}): ShipwireTrackingResponse {
  return {
    tracking_number: 'SW123456789',
    order_id: 'ORD-001',
    status: 'in_transit',
    events: [
      makeTrackingEvent({ status: 'submitted', description: 'Order submitted', location: 'Los Angeles, CA' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeOrder(overrides: Partial<ShipwireOrder> = {}): ShipwireOrder {
  return {
    id: 12345,
    order_number: 'ORD-001',
    external_id: 'EXT-001',
    status: 'processing',
    warehouse_id: 1,
    shipping_address: {
      name: 'Bob Receiver',
      address1: '456 Oak Ave',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: 'US',
      phone: '+12125551234',
      email: 'bob@example.com',
    },
    items: [
      { sku: 'SKU-001', name: 'Widget', quantity: 2, unit_price: 19.99 },
    ],
    shipment_ids: ['SHP-001'],
    shipping_amount: 5.99,
    total_amount: 45.97,
    currency: 'USD',
    requested_service: 'GROUND',
    notes: 'Handle with care',
    order_date: '2024-03-14T00:00:00Z',
    shipped_at: null,
    delivered_at: null,
    cancelled_at: null,
    created_at: '2024-03-14T12:00:00Z',
    updated_at: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

function makeWarehouse(overrides: Partial<ShipwireWarehouse> = {}): ShipwireWarehouse {
  return {
    id: 1,
    name: 'US West Coast',
    code: 'USW',
    address1: '100 Warehouse Dr',
    address2: 'Suite B',
    city: 'Los Angeles',
    state: 'CA',
    postal_code: '90001',
    country: 'US',
    timezone: 'America/Los_Angeles',
    is_active: true,
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Shipwire transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('SW123456789')
    expect(event.carrierId).toBe('shipwire')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Order submitted')
    expect(event.location?.city).toBe('Los Angeles, CA')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTrackingResponse({ events: [] })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('SW123456789')
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['submitted', 'PRE_TRANSIT'],
      ['processing', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['returned', 'RETURN_TO_SENDER'],
      ['cancelled', 'FAILURE'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ status })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformOrder ─────────────────────────────────────────────────────────

describe('Shipwire transformOrder', () => {
  it('maps canonical fields', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)

    expect(result.id).toBe('12345')
    expect(result.status).toBe('PROCESSING')
    expect(result.orderNumber).toBe('ORD-001')
    expect(result.warehouseId).toBe('1')
    expect(result.currency).toBe('USD')
    expect(result.shippingAmount).toBe(5.99)
    expect(result.totalAmount).toBe(45.97)
    expect(result.requestedServiceCode).toBe('GROUND')
    expect(result.notes).toBe('Handle with care')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps destination address', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)

    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('New York')
  })

  it('maps line items', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)

    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-001')
    expect(result.lineItems![0].name).toBe('Widget')
    expect(result.lineItems![0].quantity).toBe(2)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBeDefined()
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeOrder({
      order_number: null,
      external_id: null,
      warehouse_id: null,
      shipping_address: null,
      items: null,
      shipment_ids: null,
      shipping_amount: null,
      total_amount: null,
      requested_service: null,
      notes: null,
      order_date: null,
      created_at: null,
      updated_at: null,
    })
    const result = transformOrder(raw)

    expect(result.orderNumber).toBeUndefined()
    expect(result.warehouseId).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.shippingAmount).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('maps all order statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['submitted', 'PENDING'],
      ['processing', 'PROCESSING'],
      ['completed', 'DELIVERED'],
      ['cancelled', 'CANCELLED'],
      ['held', 'ON_HOLD'],
      ['returned', 'RETURNED'],
      ['something_else', 'PENDING'],
      [null, 'PENDING'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeOrder({ status })
      expect(transformOrder(raw).status).toBe(expected)
    }
  })
})

// ─── transformWarehouse ─────────────────────────────────────────────────────

describe('Shipwire transformWarehouse', () => {
  it('maps canonical fields', () => {
    const raw = makeWarehouse()
    const result = transformWarehouse(raw)

    expect(result.id).toBe('1')
    expect(result.name).toBe('US West Coast')
    expect(result.code).toBe('USW')
    expect(result.isActive).toBe(true)
    expect(result.timezone).toBe('America/Los_Angeles')
  })

  it('maps address', () => {
    const raw = makeWarehouse()
    const result = transformWarehouse(raw)

    expect(result.address?.street1).toBe('100 Warehouse Dr')
    expect(result.address?.city).toBe('Los Angeles')
    expect(result.address?.state).toBe('CA')
    expect(result.address?.country).toBe('US')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeWarehouse()
    expect(transformWarehouse(raw).metadata).toBeDefined()
  })

  it('handles missing address gracefully', () => {
    const raw = makeWarehouse({
      address1: null,
      address2: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
    })
    const result = transformWarehouse(raw)
    expect(result.address).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeWarehouse({
      name: null,
      code: null,
      timezone: null,
      is_active: null,
    })
    const result = transformWarehouse(raw)

    expect(result.name).toBeUndefined()
    expect(result.code).toBeUndefined()
    expect(result.timezone).toBeUndefined()
    expect(result.isActive).toBeUndefined()
  })
})
