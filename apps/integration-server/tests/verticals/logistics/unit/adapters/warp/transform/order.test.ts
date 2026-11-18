import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type WarpOrderResponse,
} from '../../../../../../../src/verticals/logistics/adapters/warp/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(overrides: Partial<WarpOrderResponse> = {}): WarpOrderResponse {
  return {
    order_id: 'ord-warp-001',
    order_number: 'ORD-2024-001',
    shipment_id: 'shp-warp-001',
    shipment_number: 'SHP-2024-001',
    tracking_number: 'TRK-2024-001',
    mode: 'ltl',
    status: 'booked',
    origin_zip: '90210',
    destination_zip: '10001',
    pickup_date: '2024-03-01T00:00:00Z',
    delivery_date: '2024-03-05T00:00:00Z',
    price_usd: 149.99,
    booked_at: '2024-03-01T00:00:00Z',
    cancelled_at: null,
    pickup_address: {
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90210',
      street: '123 Pickup St',
      contactName: 'Alice Sender',
      phone: '555-111-2222',
      email: 'alice@example.com',
    },
    delivery_address: {
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      street: '456 Delivery Ave',
      contactName: 'Bob Receiver',
      phone: '555-333-4444',
      email: 'bob@example.com',
    },
    ...overrides,
  }
}

describe('transformOrder (warp)', () => {
  it('maps id from order_id', () => {
    expect(transformOrder(makeRaw()).id).toBe('ord-warp-001')
  })

  it('falls back id to shipment_id when order_id absent', () => {
    expect(transformOrder(makeRaw({ order_id: undefined })).id).toBe('shp-warp-001')
  })

  it('maps orderNumber from order_number', () => {
    expect(transformOrder(makeRaw()).orderNumber).toBe('ORD-2024-001')
  })

  it('falls back orderNumber to shipment_number when order_number absent', () => {
    expect(transformOrder(makeRaw({ order_number: undefined })).orderNumber).toBe('SHP-2024-001')
  })

  it('maps status booked → AWAITING_SHIPMENT', () => {
    expect(transformOrder(makeRaw({ status: 'booked' })).status).toBe('AWAITING_SHIPMENT')
  })

  it('maps status delivered → DELIVERED', () => {
    expect(transformOrder(makeRaw({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps status cancelled → CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status exception → ON_HOLD', () => {
    expect(transformOrder(makeRaw({ status: 'exception' })).status).toBe('ON_HOLD')
  })

  it('maps unknown status → PENDING', () => {
    expect(transformOrder(makeRaw({ status: 'unknown_xyz' })).status).toBe('PENDING')
  })

  it('maps undefined status → PENDING', () => {
    expect(transformOrder(makeRaw({ status: undefined })).status).toBe('PENDING')
  })

  it('maps currency to USD', () => {
    expect(transformOrder(makeRaw()).currency).toBe('USD')
  })

  it('converts price_usd to minor units (cents)', () => {
    // $149.99 → 14999 cents
    expect(transformOrder(makeRaw()).totalAmount).toBe(14999)
  })

  it('sets totalAmount undefined when price_usd is absent', () => {
    expect(transformOrder(makeRaw({ price_usd: undefined })).totalAmount).toBeUndefined()
  })

  it('maps originAddress city from pickup_address', () => {
    expect(transformOrder(makeRaw()).originAddress?.city).toBe('Los Angeles')
  })

  it('maps originAddress country to US', () => {
    expect(transformOrder(makeRaw()).originAddress?.country).toBe('US')
  })

  it('maps destinationAddress city from delivery_address', () => {
    expect(transformOrder(makeRaw()).destinationAddress?.city).toBe('New York')
  })

  it('falls back originAddress postalCode to origin_zip', () => {
    const result = transformOrder(makeRaw({ pickup_address: undefined }))
    expect(result.originAddress?.postalCode).toBe('90210')
  })

  it('maps shipmentIds from shipment_id', () => {
    expect(transformOrder(makeRaw()).shipmentIds).toEqual(['shp-warp-001'])
  })

  it('maps shippedAt from pickup_date', () => {
    expect(transformOrder(makeRaw()).shippedAt).toBeInstanceOf(Date)
  })

  it('maps deliveredAt from delivery_date', () => {
    expect(transformOrder(makeRaw()).deliveredAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from booked_at', () => {
    expect(transformOrder(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces output that parses against OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })
})
