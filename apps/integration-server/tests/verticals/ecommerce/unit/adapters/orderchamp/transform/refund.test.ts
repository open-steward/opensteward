/**
 * Docs: https://developers.orderchamp.com/getting-started (orderProductRefundCreate)
 */
import { describe, it, expect } from 'vitest'
import {
  untransformRefund,
  transformRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/orderchamp/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

describe('untransformRefund (Orderchamp orderProductRefundCreate input)', () => {
  it('maps orderId + refundLineItems to orderProductId/quantity', () => {
    const input = untransformRefund({
      orderId: 'order-1',
      refundLineItems: [{ lineItemId: 'orderproduct-1', quantity: 1 }],
    })
    expect(input).toEqual({ orderId: 'order-1', products: [{ orderProductId: 'orderproduct-1', quantity: 1 }] })
  })

  it('throws without orderId', () => {
    expect(() => untransformRefund({ refundLineItems: [{ lineItemId: 'li1', quantity: 1 }] })).toThrow(
      /requires orderId/,
    )
  })

  it('throws without at least one refundLineItems entry', () => {
    expect(() => untransformRefund({ orderId: 'o1', refundLineItems: [] })).toThrow(/at least one refundLineItems/)
  })
})

describe('transformRefund (Orderchamp orderProductRefundCreate response)', () => {
  it('combines the response id with the request that produced it', () => {
    const request = untransformRefund({ orderId: 'o1', refundLineItems: [{ lineItemId: 'li1', quantity: 1 }] })
    const result = transformRefund({ id: 'refund-1' }, request)
    expect(result.id).toBe('refund-1')
    expect(result.orderId).toBe('o1')
    expect(result.refundLineItems).toEqual([{ lineItemId: 'li1', quantity: 1 }])
  })

  it('produces schema-valid output', () => {
    const request = untransformRefund({ orderId: 'o1', refundLineItems: [{ lineItemId: 'li1', quantity: 1 }] })
    expect(() => RefundSchema.parse(transformRefund({ id: 'r1' }, request))).not.toThrow()
  })
})
