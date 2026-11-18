/**
 * Cafe24 refund → canonical Refund.
 *
 * Fixtures: the documented examples of GET /api/v2/admin/refunds
 * (https://apidocs.cafe24.com/en/docs/admin/get-refunds, first row) and
 * GET /api/v2/admin/refunds/{refund_code}
 * (https://apidocs.cafe24.com/en/docs/admin/get-refunds-by-refund-code).
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  transformRefundDetail,
  untransformRefund,
  type RawCafe24RefundDetail,
  type RawCafe24RefundRow,
} from '../../../../../../../src/verticals/ecommerce/adapters/cafe24/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

const documentedRow = {
  shop_no: 1,
  member_id: 'sampleid',
  member_email: 'sample@sample.com',
  buyer_email: 'sample@sample.com',
  order_date: '2019-11-21T14:47:54+09:00',
  accepted_refund_date: '2019-11-21T14:49:45+09:00',
  refund_date: '2019-11-22T17:31:50+09:00',
  order_id: '20191121-0000032',
  refund_code: 'C20191121-0000003',
  order_item_code: ['20191121-0000032-01'],
  quantity: 1,
  actual_refund_amount: '12610.00',
  used_points: '0.00',
  used_credits: '0.00',
  currency: 'KRW',
  status: 'T',
  refund_bank_name: 'Woori Bank',
  refund_bank_account_no: '1234567890',
  refund_bank_account_holder: 'John Doe',
} satisfies RawCafe24RefundRow & Record<string, unknown>

const documentedDetail = {
  shop_no: 1,
  order_id: '20191118-0000018',
  refund_code: 'C20191118-0000001',
  currency: 'KRW',
  accepted_refund_date: '2019-11-18T17:31:00+09:00',
  refund_date: '2019-11-18T17:31:50+09:00',
  status: 'T',
  refund_amount: '17610.00',
  refund_bank_account_no: '1234567890',
  refund_reason: 'Refund to cash',
} satisfies RawCafe24RefundDetail & Record<string, unknown>

describe('transformRefund (cafe24 GET /refunds row)', () => {
  it('maps the documented example and parses with RefundSchema', () => {
    expect(RefundSchema.parse(transformRefund(documentedRow))).toEqual({
      id: 'C20191121-0000003',
      orderId: '20191121-0000032',
      amount: { amount: 12610, currency: 'KRW' },
      createdAt: '2019-11-21T05:49:45.000Z',
      processedAt: '2019-11-22T08:31:50.000Z',
      metadata: {
        refundCode: 'C20191121-0000003',
        shopNo: 1,
        status: 'T',
        orderItemCodes: ['20191121-0000032-01'],
      },
    })
  })

  it('scales by the row currency, not a fixed factor', () => {
    const r = transformRefund({ ...documentedRow, actual_refund_amount: 12.5, currency: 'USD' })
    expect(r.amount).toEqual({ amount: 1250, currency: 'USD' })
  })

  it('omits the amount when the currency is absent rather than defaulting one', () => {
    const r = RefundSchema.parse(transformRefund({ ...documentedRow, currency: null }))
    expect(r.amount).toBeUndefined()
  })

  it('omits the amount when it is absent rather than writing 0', () => {
    const r = RefundSchema.parse(transformRefund({ ...documentedRow, actual_refund_amount: null }))
    expect(r.amount).toBeUndefined()
  })

  it('copies no refund bank account into the output', () => {
    expect(JSON.stringify(transformRefund(documentedRow))).not.toContain('1234567890')
  })
})

describe('transformRefundDetail (cafe24 GET /refunds/{refund_code})', () => {
  it('maps the documented example and parses with RefundSchema', () => {
    expect(RefundSchema.parse(transformRefundDetail(documentedDetail))).toEqual({
      id: 'C20191118-0000001',
      orderId: '20191118-0000018',
      amount: { amount: 17610, currency: 'KRW' },
      reason: 'Refund to cash',
      createdAt: '2019-11-18T08:31:00.000Z',
      processedAt: '2019-11-18T08:31:50.000Z',
      metadata: { refundCode: 'C20191118-0000001', shopNo: 1, status: 'T' },
    })
  })

  it('the id is the refund code, the same id a list row returns', () => {
    expect(transformRefundDetail(documentedDetail).id).toBe(documentedDetail.refund_code)
  })
})

describe('untransformRefund (cafe24)', () => {
  it('writes refund_type and items', () => {
    const body = untransformRefund({
      reason: 'warranty',
      refundLineItems: [{ lineItemId: 'OI-999', quantity: 1 }],
    })
    expect(body.refund_type).toBe('warranty')
    const items = body.items as Array<{ order_item_code: string; quantity: number }>
    expect(items[0]!.order_item_code).toBe('OI-999')
  })
})
