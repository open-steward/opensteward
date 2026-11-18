import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawTmallTrade,
  type RawTmallSubOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/tmall/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSubOrder(overrides: Partial<RawTmallSubOrder> = {}): RawTmallSubOrder {
  return {
    oid: '7890001',
    num_iid: '12345678901',
    title: '李宁男款羽绒服冬季保暖外套 黑色 L',
    sku_id: '88001',
    outer_sku_id: 'COAT-BLK-L',
    price: '399.00',
    payment: '399.00',
    total_fee: '399.00',
    num: 1,
    status: 'WAIT_BUYER_CONFIRM_GOODS',
    ...overrides,
  }
}

function makeTrade(overrides: Partial<RawTmallTrade> = {}): RawTmallTrade {
  return {
    tid: '4200001234567890',
    status: 'WAIT_BUYER_CONFIRM_GOODS',
    type: 'fixed',
    buyer_nick: 'tb_buyer_zhang_wei',
    buyer_email: undefined,
    receiver_name: '张伟',
    receiver_phone: '010-12345678',
    receiver_mobile: '13800138000',
    receiver_state: '上海',
    receiver_city: '上海市',
    receiver_district: '浦东新区',
    receiver_address: '张江高科路123号 3栋401室',
    receiver_zip: '201203',
    payment: '399.00',
    post_fee: '0.00',
    discount_fee: '20.00',
    created: '2024-11-01T09:30:00.000Z',
    modified: '2024-11-01T10:15:00.000Z',
    pay_time: '2024-11-01T09:35:00.000Z',
    orders: {
      order: [makeSubOrder()],
    },
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformOrder (Tmall)', () => {
  it('uses tid as canonical id and orderNumber', () => {
    const result = transformOrder(makeTrade())
    expect(result.id).toBe('4200001234567890')
    expect(result.orderNumber).toBe('4200001234567890')
  })

  it('sets currency to CNY', () => {
    const result = transformOrder(makeTrade())
    expect(result.currency).toBe('CNY')
  })

  it('maps payment to totalPrice', () => {
    const result = transformOrder(makeTrade())
    expect(result.totalPrice).toEqual({ amount: 399, currency: 'CNY' })
  })

  it('maps post_fee to totalShipping', () => {
    const result = transformOrder(makeTrade())
    expect(result.totalShipping).toEqual({ amount: 0, currency: 'CNY' })
  })

  it('maps non-zero discount_fee to totalDiscounts', () => {
    const result = transformOrder(makeTrade())
    expect(result.totalDiscounts).toEqual({ amount: 20, currency: 'CNY' })
  })

  it('omits totalDiscounts when discount_fee is 0.00', () => {
    const result = transformOrder(makeTrade({ discount_fee: '0.00' }))
    expect(result.totalDiscounts).toBeUndefined()
  })

  it('maps WAIT_BUYER_CONFIRM_GOODS to PAID financial status', () => {
    const result = transformOrder(makeTrade({ status: 'WAIT_BUYER_CONFIRM_GOODS' }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps WAIT_BUYER_CONFIRM_GOODS to PARTIAL fulfillment status', () => {
    const result = transformOrder(makeTrade({ status: 'WAIT_BUYER_CONFIRM_GOODS' }))
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps TRADE_FINISHED to PAID / FULFILLED', () => {
    const result = transformOrder(makeTrade({ status: 'TRADE_FINISHED' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps WAIT_BUYER_PAY to PENDING / UNFULFILLED', () => {
    const result = transformOrder(makeTrade({ status: 'WAIT_BUYER_PAY' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps TRADE_CLOSED to VOIDED / UNFULFILLED and sets cancelledAt', () => {
    const result = transformOrder(
      makeTrade({ status: 'TRADE_CLOSED', end_time: '2024-11-02T09:00:00.000Z' }),
    )
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBe('2024-11-02T09:00:00.000Z')
    expect(result.cancelReason).toBe('TRADE_CLOSED')
  })

  it('does not set cancelledAt for non-closed trades', () => {
    const result = transformOrder(makeTrade({ status: 'TRADE_FINISHED' }))
    expect(result.cancelledAt).toBeUndefined()
  })

  it('maps receiver fields to shippingAddress', () => {
    const result = transformOrder(makeTrade())
    expect(result.shippingAddress).toMatchObject({
      line1: '张江高科路123号 3栋401室',
      city: '上海市',
      region: '上海',
      postalCode: '201203',
      country: 'CN',
    })
  })

  it('hydrates line items from nested orders', () => {
    const result = transformOrder(makeTrade())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('7890001')
    expect(li.title).toBe('李宁男款羽绒服冬季保暖外套 黑色 L')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 399, currency: 'CNY' })
    expect(li.sku).toBe('COAT-BLK-L')
    expect(li.variantId).toBe('88001')
    expect(li.productId).toBe('12345678901')
  })

  it('maps mobile and pay_time', () => {
    const result = transformOrder(makeTrade())
    expect(result.phone).toBe('13800138000')
    expect(result.processedAt).toBe('2024-11-01T09:35:00.000Z')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformOrder(makeTrade())
    expect(result.createdAt).toBe('2024-11-01T09:30:00.000Z')
    expect(result.updatedAt).toBe('2024-11-01T10:15:00.000Z')
  })

  it('returns undefined lineItems for orders with no sub-orders', () => {
    const result = transformOrder(makeTrade({ orders: { order: [] } }))
    expect(result.lineItems).toBeUndefined()
  })

  it('returns undefined lineItems when orders field is absent', () => {
    const result = transformOrder(makeTrade({ orders: undefined }))
    expect(result.lineItems).toBeUndefined()
  })

  it('stores the complete raw trade in metadata', () => {
    const raw = makeTrade()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(result.metadata['tid']).toBe('4200001234567890')
  })

  it('handles multiple line items', () => {
    const trade = makeTrade({
      orders: {
        order: [
          makeSubOrder({ oid: '7890001', num: 1 }),
          makeSubOrder({ oid: '7890002', title: '第二件商品', num: 2, payment: '199.00' }),
        ],
      },
    })
    const result = transformOrder(trade)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![1]!.quantity).toBe(2)
    expect(result.lineItems![1]!.price).toEqual({ amount: 199, currency: 'CNY' })
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeTrade())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('mapFinancialStatus (Tmall)', () => {
  it('maps all known statuses', () => {
    expect(mapFinancialStatus('WAIT_BUYER_PAY')).toBe('PENDING')
    expect(mapFinancialStatus('TRADE_NO_CREATE_PAY')).toBe('PENDING')
    expect(mapFinancialStatus('WAIT_SELLER_SEND_GOODS')).toBe('PAID')
    expect(mapFinancialStatus('WAIT_BUYER_CONFIRM_GOODS')).toBe('PAID')
    expect(mapFinancialStatus('TRADE_FINISHED')).toBe('PAID')
    expect(mapFinancialStatus('TRADE_CLOSED')).toBe('VOIDED')
    expect(mapFinancialStatus('TRADE_CLOSED_BY_TAOBAO')).toBe('VOIDED')
  })

  it('returns undefined for unknown or absent status', () => {
    expect(mapFinancialStatus(undefined)).toBeUndefined()
    expect(mapFinancialStatus('')).toBeUndefined()
    expect(mapFinancialStatus('UNKNOWN_STATUS')).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (Tmall)', () => {
  it('maps all known statuses', () => {
    expect(mapFulfillmentStatus('TRADE_NO_CREATE_PAY')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('WAIT_BUYER_PAY')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('WAIT_SELLER_SEND_GOODS')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('WAIT_BUYER_CONFIRM_GOODS')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('TRADE_FINISHED')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('TRADE_CLOSED')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('TRADE_CLOSED_BY_TAOBAO')).toBe('UNFULFILLED')
  })

  it('returns undefined for unknown or absent status', () => {
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
    expect(mapFulfillmentStatus('')).toBeUndefined()
  })
})
