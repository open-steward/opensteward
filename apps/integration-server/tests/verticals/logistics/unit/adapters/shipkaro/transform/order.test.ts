import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ShipKaroOrder,
} from '../../../../../../../src/verticals/logistics/adapters/shipkaro/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(overrides: Partial<ShipKaroOrder> = {}): ShipKaroOrder {
  return {
    id: 999,
    order_id: 'ORD-SKR-001',
    channel_order_id: 'CH-001',
    status: 'DELIVERED',
    customer_name: 'Ravi Kumar',
    customer_email: 'ravi@example.com',
    customer_phone: '+919876543210',
    shipping_name: 'Ravi Kumar',
    shipping_address: '42 Gandhi Nagar',
    shipping_city: 'Mumbai',
    shipping_state: 'MH',
    shipping_pincode: '400001',
    shipping_country: 'IN',
    billing_name: 'Seller Co',
    billing_address: '1 Seller Road',
    billing_city: 'Delhi',
    billing_state: 'DL',
    billing_pincode: '110001',
    billing_country: 'IN',
    items: [{ id: 1, sku: 'SKU-001', name: 'Widget', quantity: 2, selling_price: 500 }],
    sub_total: 1000,
    shipping_charges: 50,
    discount: 0,
    total: 1050,
    courier_name: 'BlueDart',
    awb_code: 'AWB-001',
    order_date: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id as string from numeric id', () => {
    expect(transformOrder(makeRaw()).id).toBe('999')
  })

  it('maps orderNumber from channel_order_id', () => {
    expect(transformOrder(makeRaw()).orderNumber).toBe('CH-001')
  })

  it('maps status DELIVERED', () => {
    expect(transformOrder(makeRaw({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps status PENDING for NEW', () => {
    expect(transformOrder(makeRaw({ status: 'NEW' })).status).toBe('PENDING')
  })

  it('maps status AWAITING_SHIPMENT for READY_TO_SHIP', () => {
    expect(transformOrder(makeRaw({ status: 'READY_TO_SHIP' })).status).toBe('AWAITING_SHIPMENT')
  })

  it('maps status RETURNED for RTO_DELIVERED', () => {
    expect(transformOrder(makeRaw({ status: 'RTO_DELIVERED' })).status).toBe('RETURNED')
  })

  it('maps destinationAddress from shipping_ fields', () => {
    const result = transformOrder(makeRaw())
    expect(result.destinationAddress?.city).toBe('Mumbai')
    expect(result.destinationAddress?.state).toBe('MH')
    expect(result.destinationAddress?.postalCode).toBe('400001')
  })

  it('maps lineItems from items array', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-001')
    expect(result.lineItems![0].quantity).toBe(2)
  })

  it('maps totalAmount', () => {
    expect(transformOrder(makeRaw()).totalAmount).toBe(1050)
  })

  it('maps requestedServiceCode from courier_name', () => {
    expect(transformOrder(makeRaw()).requestedServiceCode).toBe('BlueDart')
  })

  it('maps orderAt from order_date', () => {
    expect(transformOrder(makeRaw()).orderAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('passes schema validation', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
