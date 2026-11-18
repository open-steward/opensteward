import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  mapFulfillmentStatus,
  type RawJdLogisticsTrace,
} from '../../../../../../../src/verticals/ecommerce/adapters/jdcom/transform/fulfillment'
import type { RawJdOrder } from '../../../../../../../src/verticals/ecommerce/adapters/jdcom/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(overrides: Partial<RawJdOrder> = {}): RawJdOrder {
  return {
    order_id: 'JD2024010100001',
    order_state: 'WAIT_GOODS_RECEIVE',
    item_info_list: [
      { sku_id: 10086001, item_total: 1 },
      { sku_id: 10086002, item_total: 2 },
    ],
    order_start_time: '2024-01-01 10:00:00',
    modified: '2024-01-02 08:00:00',
    waybill: 'JDV001234567',
    ...overrides,
  }
}

function makeTrace(overrides: Partial<RawJdLogisticsTrace> = {}): RawJdLogisticsTrace {
  return {
    waybill_code: 'JDV001234567',
    carrier: 'JD_LOGISTICS',
    carrier_name: '京东快递',
    trace_list: [
      { msg_time: '2024-01-02 08:00:00', content: '已发货' },
      { msg_time: '2024-01-03 14:00:00', content: '已到达北京分拨中心' },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (JD.com)', () => {
  it('uses order_id:shipping as the canonical id', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.id).toBe('JD2024010100001:shipping')
    expect(result.orderId).toBe('JD2024010100001')
  })

  it('maps WAIT_GOODS_RECEIVE to SUCCESS', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps WAIT_SELLER_STOCK_OUT to OPEN', () => {
    const result = transformFulfillment(makeOrder({ order_state: 'WAIT_SELLER_STOCK_OUT' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps TRADE_CANCELED to CANCELLED', () => {
    const result = transformFulfillment(makeOrder({ order_state: 'TRADE_CANCELED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps LOCKED to PENDING', () => {
    const result = transformFulfillment(makeOrder({ order_state: 'LOCKED' }))
    expect(result.status).toBe('PENDING')
  })

  it('includes tracking number from trace', () => {
    const result = transformFulfillment(makeOrder(), makeTrace())
    expect(result.trackingNumber).toBe('JDV001234567')
    expect(result.carrier).toBe('京东快递')
  })

  it('falls back to order waybill when no trace', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.trackingNumber).toBe('JDV001234567')
  })

  it('maps line items from order item_info_list', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: '10086001', quantity: 1 })
    expect(result.lineItems![1]).toEqual({ lineItemId: '10086002', quantity: 2 })
  })

  it('includes shippedAt for shipped orders', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.shippedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeOrder(), makeTrace())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('preserves raw data in metadata', () => {
    const result = transformFulfillment(makeOrder(), makeTrace())
    expect(result.metadata['order_id']).toBe('JD2024010100001')
    expect(result.metadata['trace']).not.toBeNull()
  })

  it('handles missing item list gracefully', () => {
    const result = transformFulfillment(makeOrder({ item_info_list: undefined }))
    expect(result.lineItems).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (JD.com)', () => {
  it('returns PENDING for undefined input', () => {
    expect(mapFulfillmentStatus(undefined)).toBe('PENDING')
  })

  it('returns PENDING for unknown state', () => {
    expect(mapFulfillmentStatus('SOMETHING_ELSE')).toBe('PENDING')
  })

  it('maps FINISHED_L to SUCCESS', () => {
    expect(mapFulfillmentStatus('FINISHED_L')).toBe('SUCCESS')
  })

  it('maps WAIT_SELLER_DELIVERY to OPEN', () => {
    expect(mapFulfillmentStatus('WAIT_SELLER_DELIVERY')).toBe('OPEN')
  })
})
