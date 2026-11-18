import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type OutvioOrder,
  type OutvioLineItem,
} from '../../../../../../../src/verticals/logistics/adapters/outvio/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// NOTE: OrderSchema.subtotalAmount / taxAmount / shippingAmount / discountAmount /
// totalAmount use z.number().min(0) (NOT integer-only), so parseDecimal floats are
// valid for those fields. LineitemSchema.unitAmount / totalAmount use nullish(Amount)
// which is z.number().int() — so we use integer values in line item prices.

function makeLineItem(overrides: Partial<OutvioLineItem> = {}): OutvioLineItem {
  return {
    id: 'li-001',
    sku: 'SKU-001',
    name: 'Widget Pro',
    description: 'A great widget',
    quantity: 2,
    price: 2999,
    total: 5998,
    ...overrides,
  }
}

function makeRawOrder(overrides: Partial<OutvioOrder> = {}): OutvioOrder {
  return {
    id: 'ord-001',
    orderNumber: 'ORD-2024-001',
    status: 'shipped',
    customerId: 'cus-001',
    warehouseId: 'wh-001',
    originAddress: {
      name: 'Acme Warehouse',
      address1: '1 Warehouse Way',
      city: 'Valencia',
      country: 'ES',
    },
    destinationAddress: {
      name: 'Jane Doe',
      address1: '123 Main St',
      city: 'Madrid',
      zip: '28001',
      country: 'ES',
    },
    lineItems: [makeLineItem()],
    shipmentIds: ['shp-001', 'shp-002'],
    currency: 'EUR',
    subtotal: 5998,
    tax: 1259.58,
    shippingCost: 399,
    discount: 0,
    total: 7656.58,
    notes: 'Handle with care',
    requestedServiceCode: 'PAQPREMIUM',
    orderedAt: '2024-03-01T00:00:00Z',
    shippedAt: '2024-03-02T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps canonical fields', () => {
    const raw = makeRawOrder()
    const result = transformOrder(raw)

    expect(result.id).toBe('ord-001')
    expect(result.orderNumber).toBe('ORD-2024-001')
    expect(result.status).toBe('SHIPPED')
    expect(result.customerId).toBe('cus-001')
    expect(result.warehouseId).toBe('wh-001')
    expect(result.currency).toBe('EUR')
    expect(result.notes).toBe('Handle with care')
    expect(result.requestedServiceCode).toBe('PAQPREMIUM')
  })

  it('maps origin and destination addresses', () => {
    const raw = makeRawOrder()
    const result = transformOrder(raw)

    expect(result.originAddress?.name).toBe('Acme Warehouse')
    expect(result.originAddress?.city).toBe('Valencia')
    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.city).toBe('Madrid')
    expect(result.destinationAddress?.postalCode).toBe('28001')
  })

  it('maps shipmentIds from array', () => {
    const result = transformOrder(makeRawOrder())
    expect(result.shipmentIds).toEqual(['shp-001', 'shp-002'])
  })

  it('maps line items with unit and total amounts', () => {
    const raw = makeRawOrder()
    const result = transformOrder(raw)

    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('li-001')
    expect(result.lineItems![0].sku).toBe('SKU-001')
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(2999)
    expect(result.lineItems![0].totalAmount).toBe(5998)
  })

  it('maps monetary totals', () => {
    const raw = makeRawOrder()
    const result = transformOrder(raw)

    expect(result.subtotalAmount).toBe(5998)
    expect(result.shippingAmount).toBe(399)
    expect(result.discountAmount).toBe(0)
  })

  it('maps date fields to Date objects', () => {
    const raw = makeRawOrder()
    const result = transformOrder(raw)

    expect(result.orderAt).toBeInstanceOf(Date)
    expect(result.shippedAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps all order statuses correctly', () => {
    const cases: [string, string][] = [
      ['pending', 'PENDING'],
      ['processing', 'PROCESSING'],
      ['on_hold', 'ON_HOLD'],
      ['hold', 'ON_HOLD'],
      ['awaiting_shipment', 'AWAITING_SHIPMENT'],
      ['ready_to_ship', 'AWAITING_SHIPMENT'],
      ['shipped', 'SHIPPED'],
      ['in_transit', 'SHIPPED'],
      ['delivered', 'DELIVERED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['returned', 'RETURNED'],
    ]
    for (const [status, expected] of cases) {
      expect(transformOrder(makeRawOrder({ status })).status).toBe(expected)
    }
  })

  it('returns undefined status for unknown status strings', () => {
    expect(transformOrder(makeRawOrder({ status: 'mystery_status' })).status).toBeUndefined()
  })

  it('prefers camelCase fields over snake_case', () => {
    const raw = makeRawOrder({
      orderNumber: 'CAMEL-001',
      order_number: 'SNAKE-001',
      shippingCost: 500,
      shipping_cost: 999,
    })
    const result = transformOrder(raw)
    expect(result.orderNumber).toBe('CAMEL-001')
    expect(result.shippingAmount).toBe(500)
  })

  it('falls back to snake_case fields when camelCase is absent', () => {
    const raw: OutvioOrder = {
      id: 'ord-snake',
      order_number: 'SNAKE-002',
      status: 'pending',
      shipping_cost: 750,
      destination_address: { name: 'Bob', city: 'Seville', country: 'ES' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformOrder(raw)
    expect(result.orderNumber).toBe('SNAKE-002')
    expect(result.shippingAmount).toBe(750)
    expect(result.destinationAddress?.name).toBe('Bob')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('uses shippingAddress as destinationAddress fallback', () => {
    const raw: OutvioOrder = {
      id: 'ord-ship',
      shippingAddress: { name: 'Fallback User', city: 'Bilbao', country: 'ES' },
    }
    const result = transformOrder(raw)
    expect(result.destinationAddress?.name).toBe('Fallback User')
    expect(result.destinationAddress?.city).toBe('Bilbao')
  })

  it('passes schema validation for a well-formed order', () => {
    const result = transformOrder(makeRawOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeRawOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: OutvioOrder = { id: 'ord-min', status: 'pending' }
    const result = transformOrder(raw)

    expect(result.id).toBe('ord-min')
    expect(result.orderNumber).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.lineItems).toEqual([])
    expect(result.shipmentIds).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
  })
})
