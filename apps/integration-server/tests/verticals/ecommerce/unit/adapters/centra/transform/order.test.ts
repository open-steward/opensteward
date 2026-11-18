import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawCentraOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/centra/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawCentraOrder> = {}): RawCentraOrder {
  return {
    orderId: 1001,
    selectionId: 'sel-abc123',
    orderDate: '2024-03-01T00:00:00Z',
    orderStatus: 'paid',
    customerId: 88,
    email: 'order@centra.se',
    phoneNumber: '+46701234567',
    currency: 'SEK',
    shippingValue: '49.00',
    voucherValue: '0.00',
    grandTotalValue: '1249.00',
    grandTotalTaxValue: '249.80',
    deliveryAddress: 'Kungsgatan 1',
    deliveryCity: 'Stockholm',
    deliveryZip: '11122',
    deliveryCountry: 'SE',
    billingAddress: 'Kungsgatan 1',
    billingCity: 'Stockholm',
    billingZip: '11122',
    billingCountry: 'SE',
    products: [
      {
        lineId: 301,
        qty: 1,
        sku: 'SHIRT-XL-BLUE',
        productId: 201,
        variantId: 401,
        stockItemId: 4001,
        name: 'Blue Shirt',
        variant: 'Blue',
        size: 'XL',
        price: '1200.00',
      },
    ],
    shipments: [{ shipmentId: 555 }],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps orderId to id string', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
  })

  it('maps selectionId to orderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('sel-abc123')
  })

  it('maps customerId to string', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('88')
  })

  it('maps "paid" status to PAID', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps "untouched" status to PENDING', () => {
    const result = transformOrder(makeOrder({ orderStatus: 'untouched' }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps "cancelled" status to VOIDED', () => {
    const result = transformOrder(makeOrder({ orderStatus: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('maps fulfillmentStatus to FULFILLED when shipments exist', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps fulfillmentStatus to UNFULFILLED when no shipments', () => {
    const result = transformOrder(makeOrder({ shipments: [] }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('converts grandTotalValue to minor units (SEK)', () => {
    // 1249.00 SEK → 124900 minor units
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 124900, currency: 'SEK' })
  })

  it('converts shippingValue to minor units', () => {
    // 49.00 SEK → 4900 minor units
    const result = transformOrder(makeOrder())
    expect(result.totalShipping).toEqual({ amount: 4900, currency: 'SEK' })
  })

  it('maps line items from products array', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('301')
    expect(li.quantity).toBe(1)
    // title is joined from name / variant / size
    expect(li.title).toBe('Blue Shirt / Blue / XL')
    // variantId uses stockItemId when available
    expect(li.variantId).toBe('4001')
  })

  it('maps delivery address to shippingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.city).toBe('Stockholm')
    expect(result.shippingAddress?.country).toBe('SE')
  })

  it('maps billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.city).toBe('Stockholm')
    expect(result.billingAddress?.country).toBe('SE')
  })

  it('maps fulfillmentIds from shipments', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['555'])
  })

  it('maps orderDate to createdAt (toIsoDatetime normalizes to .000Z form)', () => {
    const result = transformOrder(makeOrder())
    // toIsoDatetime converts via new Date().toISOString() which emits .000Z milliseconds
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips email and currency via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.email).toBe('order@centra.se')
    expect(raw.currency).toBe('SEK')
  })
})
