/**
 * Docs: https://developers.falabella.com/docs/orders/getorder (verbatim XML
 * response example) and .../orders/getorderitems (verbatim JSON response
 * example) — both quoted in the source file header.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFulfillmentStatus,
  type RawFalabellaOrder,
  type RawFalabellaOrderItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/falabella/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawFalabellaOrder> = {}): RawFalabellaOrder {
  return {
    OrderId: '1104901123',
    OrderNumber: '2777001234',
    Price: '19990',
    CreatedAt: '2025-04-01 12:00:00',
    UpdatedAt: '2025-04-01 15:00:00',
    AddressBilling: {
      FirstName: 'Fala',
      LastName: 'Test',
      Address1: 'Avenida Siempre Viva',
      Address2: '742',
      Address3: 'Depto 101',
      CustomerEmail: 'buyer@example.com',
      City: 'Santiago',
      Region: 'Metropolitana',
      PostCode: '7500000',
      Country: 'CL',
    },
    AddressShipping: {
      FirstName: 'Fala',
      LastName: 'Test',
      Address1: 'Avenida Siempre Viva',
      Address2: '742',
      City: 'Santiago',
      Region: 'Metropolitana',
      Country: 'CL',
      CustomerEmail: 'buyer@example.com',
      Phone: '+56912345678',
    },
    GrandTotal: '19990',
    Statuses: { Status: 'ready_to_ship' },
    ...overrides,
  }
}

function makeItem(overrides: Partial<RawFalabellaOrderItem> = {}): RawFalabellaOrderItem {
  return {
    OrderItemId: '101311982',
    OrderId: '1104901123',
    Name: 'Test Product',
    Sku: '2521154701',
    Currency: 'CLP',
    Status: 'pending',
    ShipmentProvider: 'ibis',
    TrackingCode: '800026611544860011',
    ItemPrice: '3521.00',
    PaidPrice: '3521.00',
    ...overrides,
  }
}

describe('mapFulfillmentStatus (Falabella)', () => {
  it('maps confirmed pre-shipment states to UNFULFILLED', () => {
    expect(mapFulfillmentStatus('pending')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('ready_to_ship')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('canceled')).toBe('UNFULFILLED')
  })

  it('falls back to unknown for an unrecognised status', () => {
    expect(mapFulfillmentStatus('something_new')).toBe('unknown')
    expect(mapFulfillmentStatus(undefined)).toBe('unknown')
  })
})

describe('transformOrder (Falabella)', () => {
  it('maps identity and dates (space-separated, no timezone) to ISO', () => {
    const result = transformOrder(makeOrder(), [], 'CLP')
    expect(result.id).toBe('1104901123')
    expect(result.orderNumber).toBe('2777001234')
    expect(result.createdAt).toBe('2025-04-01T12:00:00.000Z')
    expect(result.updatedAt).toBe('2025-04-01T15:00:00.000Z')
  })

  it('lifts AddressShipping CustomerEmail/Phone to the order level', () => {
    const result = transformOrder(makeOrder(), [], 'CLP')
    expect(result.email).toBe('buyer@example.com')
    expect(result.phone).toBe('+56912345678')
  })

  it('combines Address2/Address3 into line2 and maps Region/Country', () => {
    const result = transformOrder(makeOrder(), [], 'CLP')
    expect(result.billingAddress?.line1).toBe('Avenida Siempre Viva')
    expect(result.billingAddress?.line2).toBe('742 Depto 101')
    expect(result.billingAddress?.region).toBe('Metropolitana')
    expect(result.billingAddress?.country).toBe('CL')
  })

  it('uses the first item’s Currency over the connection-derived fallback', () => {
    const result = transformOrder(makeOrder(), [makeItem({ Currency: 'COP' })], 'CLP')
    expect(result.currency).toBe('COP')
    expect(result.totalPrice).toEqual({ amount: 1999000, currency: 'COP' })
  })

  it('falls back to the connection-derived currency with no items', () => {
    const result = transformOrder(makeOrder(), [], 'PEN')
    expect(result.currency).toBe('PEN')
  })

  it('maps order items with an implicit quantity of 1 (no Quantity field on GetOrderItems)', () => {
    const result = transformOrder(makeOrder(), [makeItem()], 'CLP')
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('101311982')
    expect(li.quantity).toBe(1)
    expect(li.sku).toBe('2521154701')
    // CLP is a zero-decimal currency (majorToMinor exponent 0): 3521.00 → 3521, not 352100.
    expect(li.price).toEqual({ amount: 3521, currency: 'CLP' })
  })

  it('sets cancelledAt only when Statuses.Status includes canceled', () => {
    const cancelled = transformOrder(makeOrder({ Statuses: { Status: 'canceled' } }), [], 'CLP')
    expect(cancelled.cancelledAt).toBe('2025-04-01T15:00:00.000Z')
    const active = transformOrder(makeOrder(), [], 'CLP')
    expect(active.cancelledAt).toBeUndefined()
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder(), [makeItem()], 'CLP'))).not.toThrow()
  })
})
