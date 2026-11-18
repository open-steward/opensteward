import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ParcellabOrder,
  type ParcellabLineItem,
} from '../../../../../../../src/verticals/logistics/adapters/parcellab/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeLineItem(overrides: Partial<ParcellabLineItem> = {}): ParcellabLineItem {
  return {
    line_item_id: 'LI-001',
    product_id: 'PROD-001',
    sku: 'SKU-ABC',
    article_name: 'Blue Widget',
    quantity: 2,
    unit_price: 19.99,
    amount_invoiced: 39.98,
    weight: 0.5,
    weight_unit: 'kg',
    status: 'shipped',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<ParcellabOrder> = {}): ParcellabOrder {
  return {
    external_id: 'ext-ord-001',
    order_number: 'PL-ORDER-001',
    recipient_email: 'customer@example.com',
    recipient_name: 'Alice Customer',
    destination_country_iso3: 'DEU',
    recipient_postal_code: '10115',
    order_status: 'shipped',
    order_currency: 'EUR',
    order_total_amount: 49.98,
    order_tax_amount: 7.99,
    order_discount_amount: 0,
    order_date: '2024-03-01T00:00:00Z',
    shipping_address: { street: 'Unter den Linden 1', city: 'Berlin' },
    articles_order: [makeLineItem()],
    tags: ['priority'],
    trackings: [{ tracking_number: 'TRK-PL-001', courier: 'dhl' }],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parcellab transformOrder', () => {
  it('maps id from external_id', () => {
    expect(transformOrder(makeOrder()).id).toBe('ext-ord-001')
  })

  it('maps orderNumber from order_number', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('PL-ORDER-001')
  })

  it('maps shipped status to SHIPPED', () => {
    expect(transformOrder(makeOrder({ order_status: 'shipped' })).status).toBe('SHIPPED')
  })

  it('maps transit status to SHIPPED', () => {
    expect(transformOrder(makeOrder({ order_status: 'transit' })).status).toBe('SHIPPED')
  })

  it('maps pending status to PENDING', () => {
    expect(transformOrder(makeOrder({ order_status: 'pending' })).status).toBe('PENDING')
  })

  it('maps delivered status to DELIVERED', () => {
    expect(transformOrder(makeOrder({ order_status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ order_status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps sentback status to RETURNED', () => {
    expect(transformOrder(makeOrder({ order_status: 'sentback' })).status).toBe('RETURNED')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformOrder(makeOrder({ order_status: 'weird_status' })).status).toBe('UNKNOWN')
  })

  it('populates destinationAddress from recipient fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.destinationAddress?.name).toBe('Alice Customer')
    expect(r.destinationAddress?.postalCode).toBe('10115')
    expect(r.destinationAddress?.country).toBe('DEU')
    expect(r.destinationAddress?.email).toBe('customer@example.com')
  })

  it('maps shipmentIds from trackings array', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['TRK-PL-001'])
  })

  it('omits shipmentIds when trackings is empty', () => {
    expect(transformOrder(makeOrder({ trackings: [] })).shipmentIds).toBeUndefined()
  })

  it('maps currency from order_currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('maps totalAmount from order_total_amount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(49.98)
  })

  it('maps taxAmount from order_tax_amount', () => {
    expect(transformOrder(makeOrder()).taxAmount).toBe(7.99)
  })

  it('maps discountAmount from order_discount_amount', () => {
    expect(transformOrder(makeOrder()).discountAmount).toBe(0)
  })

  it('maps lineItems from articles_order', () => {
    const r = transformOrder(makeOrder())
    expect(r.lineItems).toHaveLength(1)
    expect(r.lineItems?.[0].sku).toBe('SKU-ABC')
    expect(r.lineItems?.[0].name).toBe('Blue Widget')
    expect(r.lineItems?.[0].quantity).toBe(2)
  })

  it('parses order_date as orderAt Date', () => {
    expect(transformOrder(makeOrder()).orderAt).toBeInstanceOf(Date)
  })

  it('parses created_at as createdAt Date', () => {
    expect(transformOrder(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('throws on OrderSchema validation due to source bugs: destination_country_iso3 is ISO-3166-1 alpha-3 (not alpha-2) and lineitem unit_price is a float (Amount requires integer minor-units)', () => {
    // Source bugs:
    // 1. parcelLab emits destination_country_iso3 as "DEU" (3-letter alpha-3), but
    //    AddressSchema.country is Iso3166Alpha2 (exactly 2 uppercase letters).
    // 2. unit_price (19.99) is passed directly to unitAmount, but LineitemSchema.unitAmount
    //    uses Amount which requires a safe integer (minor-unit cents).
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).toThrow()
  })
})
