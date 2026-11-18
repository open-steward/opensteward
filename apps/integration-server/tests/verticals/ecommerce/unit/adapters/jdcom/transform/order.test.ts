import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawJdOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/jdcom/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawJdOrder> = {}): RawJdOrder {
  return {
    order_id: 'JD2024010100001',
    vender_id: 'V12345',
    order_state: 'WAIT_SELLER_STOCK_OUT',
    order_total_price: 7599.00,
    freight_price: 0,
    seller_discount: 500,
    order_payment: 7099.00,
    item_info_list: [
      {
        sku_id: 10086001,
        ware_id: 50001,
        sku_name: '华为Mate 60 Pro 雅丹黑',
        item_total: 1,
        jd_price: 6999.00,
        outer_sku_id: 'SELLER-SKU-001',
      },
      {
        sku_id: 10086002,
        ware_id: 50002,
        sku_name: '华为原装保护壳',
        item_total: 2,
        jd_price: 300.00,
        outer_sku_id: 'SELLER-SKU-002',
      },
    ],
    consignee_info: {
      fullname: '张三',
      mobile: '13800138000',
      full_address: '北京市海淀区中关村大街1号',
      province: '北京',
      city: '北京市',
      county: '海淀区',
      postcode: '100080',
    },
    order_start_time: '2024-01-01 10:00:00',
    modified: '2024-01-01 12:00:00',
    payment_confirm_time: '2024-01-01 10:05:00',
    order_remark: '请尽快发货',
    ...overrides,
  }
}

describe('transformOrder (JD.com)', () => {
  it('uses order_id as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('JD2024010100001')
    expect(result.orderNumber).toBe('JD2024010100001')
  })

  it('maps WAIT_SELLER_STOCK_OUT to PAID + UNFULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps WAIT_GOODS_RECEIVE to PAID + FULFILLED', () => {
    const result = transformOrder(makeOrder({ order_state: 'WAIT_GOODS_RECEIVE' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps FINISHED_L to PAID + FULFILLED', () => {
    const result = transformOrder(makeOrder({ order_state: 'FINISHED_L' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps TRADE_CANCELED to VOIDED + UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ order_state: 'TRADE_CANCELED' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelReason).toBe('Cancelled')
  })

  it('includes cancelledAt for cancelled orders', () => {
    const result = transformOrder(
      makeOrder({ order_state: 'TRADE_CANCELED', modified: '2024-01-02 08:00:00' }),
    )
    expect(result.cancelledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('uses CNY as default currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('CNY')
  })

  it('maps line items correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toMatchObject({
      id: '10086001',
      title: '华为Mate 60 Pro 雅丹黑',
      quantity: 1,
      price: { amount: 6999, currency: 'CNY' },
    })
    expect(result.lineItems![1]).toMatchObject({
      id: '10086002',
      title: '华为原装保护壳',
      quantity: 2,
      price: { amount: 300, currency: 'CNY' },
    })
  })

  it('maps shipping address with country CN', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toMatchObject({
      line1: '北京市海淀区中关村大街1号',
      city: '北京市',
      region: '北京',
      postalCode: '100080',
      country: 'CN',
    })
  })

  it('maps total price and discounts', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 7599, currency: 'CNY' })
    expect(result.totalShipping).toEqual({ amount: 0, currency: 'CNY' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'CNY' })
  })

  it('maps order_remark as note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('请尽快发货')
  })

  it('converts date strings to ISO format', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.processedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata['order_id']).toBe('JD2024010100001')
  })

  it('handles missing item list gracefully', () => {
    const result = transformOrder(makeOrder({ item_info_list: undefined }))
    expect(result.lineItems).toBeUndefined()
  })

  it('handles missing consignee info gracefully', () => {
    const result = transformOrder(makeOrder({ consignee_info: undefined }))
    expect(result.shippingAddress).toBeUndefined()
  })
})

describe('mapFinancialStatus (JD.com)', () => {
  it('returns undefined for unknown state', () => {
    expect(mapFinancialStatus('SOMETHING_ELSE')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(mapFinancialStatus(undefined)).toBeUndefined()
  })

  it('maps LOCKED to PAID', () => {
    expect(mapFinancialStatus('LOCKED')).toBe('PAID')
  })
})

describe('mapFulfillmentStatus (JD.com)', () => {
  it('returns undefined for unknown state', () => {
    expect(mapFulfillmentStatus('SOMETHING_ELSE')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
  })

  it('maps LOCKED to UNFULFILLED', () => {
    expect(mapFulfillmentStatus('LOCKED')).toBe('UNFULFILLED')
  })
})
