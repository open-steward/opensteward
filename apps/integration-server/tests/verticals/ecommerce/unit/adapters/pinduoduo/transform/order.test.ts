import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawPddOrder,
  type RawPddOrderItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/pinduoduo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeOrderItem(overrides: Partial<RawPddOrderItem> = {}): RawPddOrderItem {
  return {
    sub_order_sn: 'PDD2024010100000001-01',
    goods_id: '9876543210',
    sku_id: '560001',
    goods_name: '女士真丝连衣裙夏季新款 大红色 M码',
    goods_spec: '颜色:大红色;尺码:M',
    outer_goods_id: 'DRESS-001',
    outer_sku_sn: 'DRESS-RED-M',
    goods_count: 2,
    goods_price: 8900,   // 89.00 CNY per unit
    goods_amount: 17800, // 178.00 CNY total (2 × 89.00)
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawPddOrder> = {}): RawPddOrder {
  return {
    order_sn: 'PDD2024010100000001',
    order_id: 123456789,
    order_status: 2, // WAIT_DELIVERY
    order_amount: 17600, // 176.00 CNY (after discount)
    goods_amount: 17800, // 178.00 CNY
    discount_amount: 200, // 2.00 CNY discount
    freight_amount: 0,    // free shipping
    coupon_amount: 0,
    buyer_id: 987654321,
    receiver_phone: '138****8000',
    receiver_name: '王芳',
    receiver_province: '广东省',
    receiver_city: '深圳市',
    receiver_district: '南山区',
    receiver_address: '科技园南区深南大道1号 B栋203',
    receiver_zip_code: '518057',
    item_list: [makeOrderItem()],
    created_time: 1704067200,  // 2024-01-01T00:00:00Z
    updated_time: 1704070800,  // 2024-01-01T01:00:00Z
    pay_time: 1704067500,      // 2024-01-01T00:05:00Z
    remark: '请小心包装，易碎',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformOrder (Pinduoduo)', () => {
  it('uses order_sn as canonical id and orderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('PDD2024010100000001')
    expect(result.orderNumber).toBe('PDD2024010100000001')
  })

  it('sets currency to CNY', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('CNY')
  })

  it('converts order_amount (fen) to totalPrice, unconverted', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 17600, currency: 'CNY' })
  })

  it('converts freight_amount (fen) to totalShipping, unconverted', () => {
    // non-zero freight
    const result = transformOrder(makeOrder({ freight_amount: 1200 }))
    expect(result.totalShipping).toEqual({ amount: 1200, currency: 'CNY' })
  })

  it('converts discount_amount (fen) to totalDiscounts, unconverted', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalDiscounts).toEqual({ amount: 200, currency: 'CNY' })
  })

  it('omits totalDiscounts when discount_amount is 0', () => {
    const result = transformOrder(makeOrder({ discount_amount: 0, coupon_amount: 0 }))
    expect(result.totalDiscounts).toBeUndefined()
  })

  it('uses coupon_amount as totalDiscounts when discount_amount is absent', () => {
    const result = transformOrder(
      makeOrder({ discount_amount: undefined, coupon_amount: 500 }),
    )
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'CNY' })
  })

  it('maps status 1 (WAIT_PAY) to PENDING / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ order_status: 1 }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status 2 (WAIT_DELIVERY) to PAID / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ order_status: 2 }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status 3 (WAIT_CONFIRM) to PAID / PARTIAL', () => {
    const result = transformOrder(makeOrder({ order_status: 3 }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps status 4 (FINISHED) to PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ order_status: 4 }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps status 5 (CANCELLED) to VOIDED / UNFULFILLED and sets cancelledAt', () => {
    const result = transformOrder(
      makeOrder({ order_status: 5, cancel_time: 1704159000 }),
    )
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBe('2024-01-02T01:30:00.000Z')
    expect(result.cancelReason).toBe('CANCELLED')
  })

  it('maps status 6 (REFUNDING) to PARTIALLY_REFUNDED / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ order_status: 6 }))
    expect(result.financialStatus).toBe('PARTIALLY_REFUNDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status 7 (COMPLETED) to PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ order_status: 7 }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps receiver fields to shippingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toMatchObject({
      line1: '科技园南区深南大道1号 B栋203',
      city: '深圳市',
      region: '广东省',
      postalCode: '518057',
      country: 'CN',
    })
  })

  it('maps item_list to canonical lineItems', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('PDD2024010100000001-01')
    expect(li.title).toBe('女士真丝连衣裙夏季新款 大红色 M码')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 8900, currency: 'CNY' })
    expect(li.sku).toBe('DRESS-RED-M')
    expect(li.variantId).toBe('560001')
    expect(li.productId).toBe('9876543210')
  })

  it('maps remark to note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('请小心包装，易碎')
  })

  it('maps receiver_phone to phone', () => {
    const result = transformOrder(makeOrder())
    expect(result.phone).toBe('138****8000')
  })

  it('converts pay_time Unix timestamp to ISO processedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.processedAt).toBe('2024-01-01T00:05:00.000Z')
  })

  it('converts created_time and updated_time to ISO', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-01T01:00:00.000Z')
  })

  it('does not set cancelledAt for non-cancelled orders', () => {
    const result = transformOrder(makeOrder({ order_status: 4 }))
    expect(result.cancelledAt).toBeUndefined()
    expect(result.cancelReason).toBeUndefined()
  })

  it('returns undefined lineItems when item_list is empty', () => {
    const result = transformOrder(makeOrder({ item_list: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('returns undefined lineItems when item_list is absent', () => {
    const result = transformOrder(makeOrder({ item_list: undefined }))
    expect(result.lineItems).toBeUndefined()
  })

  it('handles multiple line items', () => {
    const order = makeOrder({
      item_list: [
        makeOrderItem({ sub_order_sn: 'PDD-001', goods_count: 1 }),
        makeOrderItem({
          sub_order_sn: 'PDD-002',
          goods_name: '配套丝巾',
          sku_id: '560010',
          goods_count: 1,
          goods_price: 3900,
        }),
      ],
    })
    const result = transformOrder(order)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![1]!.price).toEqual({ amount: 3900, currency: 'CNY' })
  })

  it('stores the complete raw order object in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(result.metadata['order_sn']).toBe('PDD2024010100000001')
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('falls back to order_id string when order_sn is absent', () => {
    const result = transformOrder(makeOrder({ order_sn: undefined }))
    expect(result.id).toBe('123456789')
  })
})

describe('mapFinancialStatus (Pinduoduo)', () => {
  it('maps all known PDD status codes', () => {
    expect(mapFinancialStatus(1)).toBe('PENDING')
    expect(mapFinancialStatus(2)).toBe('PAID')
    expect(mapFinancialStatus(3)).toBe('PAID')
    expect(mapFinancialStatus(4)).toBe('PAID')
    expect(mapFinancialStatus(5)).toBe('VOIDED')
    expect(mapFinancialStatus(6)).toBe('PARTIALLY_REFUNDED')
    expect(mapFinancialStatus(7)).toBe('PAID')
  })

  it('returns undefined for unknown or absent status', () => {
    expect(mapFinancialStatus(undefined)).toBeUndefined()
    expect(mapFinancialStatus(99)).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (Pinduoduo)', () => {
  it('maps all known PDD status codes', () => {
    expect(mapFulfillmentStatus(1)).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(2)).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(3)).toBe('PARTIAL')
    expect(mapFulfillmentStatus(4)).toBe('FULFILLED')
    expect(mapFulfillmentStatus(5)).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(6)).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(7)).toBe('FULFILLED')
  })

  it('returns undefined for unknown or absent status', () => {
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
    expect(mapFulfillmentStatus(99)).toBeUndefined()
  })
})
