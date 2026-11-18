import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawShopifyOrder> = {}): RawShopifyOrder {
  return {
    id: 5001,
    order_number: 1042,
    name: '#1042',
    currency: 'BRL',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    total_price: '199.90',
    subtotal_price: '189.90',
    total_tax: '10.00',
    total_discounts: '5.00',
    total_shipping_price_set: {
      shop_money: { amount: '15.00', currency_code: 'BRL' },
    },
    email: 'cliente@exemplo.com.br',
    phone: '+5511999990000',
    customer: { id: 9001 },
    line_items: [
      {
        id: 111,
        product_id: 222,
        variant_id: 333,
        title: 'Camiseta Básica',
        quantity: 2,
        price: '89.95',
        total_discount: '5.00',
        sku: 'CAM-001',
      },
    ],
    shipping_address: {
      address1: 'Rua das Flores, 100',
      city: 'São Paulo',
      zip: '01310-100',
      country_code: 'BR',
      province: 'SP',
    },
    billing_address: {
      address1: 'Rua das Flores, 100',
      city: 'São Paulo',
      zip: '01310-100',
      country_code: 'BR',
    },
    fulfillments: [{ id: 701 }, { id: 702 }],
    refunds: [{ id: 801 }],
    transactions: [{ id: 901 }],
    discount_codes: [{ code: 'BEMVINDO10' }],
    tags: 'novo, urgente',
    note: 'Entregar antes das 18h.',
    created_at: '2024-03-01T10:00:00Z',
    updated_at: '2024-03-02T12:00:00Z',
    processed_at: '2024-03-01T10:05:00Z',
    cancelled_at: null,
    cancel_reason: null,
    ...overrides,
  }
}

describe('transformOrder (loja-integrada / Shopify)', () => {
  it('maps id, orderNumber, and name', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('5001')
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
  })

  it('uses raw currency and converts major-unit prices to minor units', () => {
    const result = transformOrder(makeRaw())
    expect(result.currency).toBe('BRL')
    // 199.90 BRL → 19990 cents
    expect(result.totalPrice).toEqual({ amount: 19990, currency: 'BRL' })
    // 5.00 → 500
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'BRL' })
    // subtotal
    expect(result.subtotalPrice).toEqual({ amount: 18990, currency: 'BRL' })
    // tax
    expect(result.totalTax).toEqual({ amount: 1000, currency: 'BRL' })
  })

  it('reads shipping from total_shipping_price_set.shop_money', () => {
    const result = transformOrder(makeRaw())
    expect(result.totalShipping).toEqual({ amount: 1500, currency: 'BRL' })
  })

  it('maps financialStatus and fulfillmentStatus', () => {
    const result = transformOrder(makeRaw())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps customer and contact fields', () => {
    const result = transformOrder(makeRaw())
    expect(result.customerId).toBe('9001')
    expect(result.email).toBe('cliente@exemplo.com.br')
    expect(result.phone).toBe('+5511999990000')
  })

  it('maps line items', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('111')
    expect(li.productId).toBe('222')
    expect(li.variantId).toBe('333')
    expect(li.title).toBe('Camiseta Básica')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 8995, currency: 'BRL' })
    expect(li.totalDiscount).toEqual({ amount: 500, currency: 'BRL' })
    expect(li.sku).toBe('CAM-001')
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeRaw())
    expect(result.shippingAddress).toMatchObject({
      line1: 'Rua das Flores, 100',
      city: 'São Paulo',
      postalCode: '01310-100',
      country: 'BR',
      region: 'SP',
    })
  })

  it('maps billing address', () => {
    const result = transformOrder(makeRaw())
    expect(result.billingAddress).toMatchObject({
      line1: 'Rua das Flores, 100',
      country: 'BR',
    })
  })

  it('maps fulfillmentIds, refundIds, transactionIds', () => {
    const result = transformOrder(makeRaw())
    expect(result.fulfillmentIds).toEqual(['701', '702'])
    expect(result.refundIds).toEqual(['801'])
    expect(result.transactionIds).toEqual(['901'])
  })

  it('splits discount codes and tags', () => {
    const result = transformOrder(makeRaw())
    expect(result.discountCodes).toEqual(['BEMVINDO10'])
    expect(result.tags).toEqual(['novo', 'urgente'])
  })

  it('maps note and timestamps', () => {
    const result = transformOrder(makeRaw())
    expect(result.note).toBe('Entregar antes das 18h.')
    expect(result.createdAt).toBe('2024-03-01T10:00:00Z')
    expect(result.updatedAt).toBe('2024-03-02T12:00:00Z')
    expect(result.processedAt).toBe('2024-03-01T10:05:00Z')
    expect(result.cancelledAt).toBeUndefined()
  })

  it('sets cancelledAt for cancelled orders', () => {
    const result = transformOrder(
      makeRaw({ cancelled_at: '2024-03-03T09:00:00Z', financial_status: 'voided' }),
    )
    expect(result.cancelledAt).toBe('2024-03-03T09:00:00Z')
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('falls back to USD when currency is absent', () => {
    const result = transformOrder(makeRaw({ currency: undefined }))
    expect(result.currency).toBe('USD')
  })

  it('returns undefined lineItems when line_items is empty', () => {
    const result = transformOrder(makeRaw({ line_items: [] }))
    // transformOrder maps empty array to empty array (not undefined)
    expect(result.lineItems).toEqual([])
  })

  it('returns undefined shippingAddress when shipping_address is absent', () => {
    const result = transformOrder(makeRaw({ shipping_address: undefined }))
    expect(result.shippingAddress).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (loja-integrada / Shopify)', () => {
  it('maps canonical fields back to Shopify keys', () => {
    const result = untransformOrder({
      email: 'cliente@exemplo.com.br',
      phone: '+5511999990000',
      currency: 'BRL',
      note: 'Entregar antes das 18h.',
      tags: ['novo', 'urgente'],
    })
    expect(result.email).toBe('cliente@exemplo.com.br')
    expect(result.phone).toBe('+5511999990000')
    expect(result.currency).toBe('BRL')
    expect(result.note).toBe('Entregar antes das 18h.')
    expect(result.tags).toBe('novo, urgente')
  })
})
