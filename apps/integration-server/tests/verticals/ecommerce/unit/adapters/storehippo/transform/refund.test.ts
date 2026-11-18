import { describe, it, expect } from 'vitest'
import {
  refundOrderNumber,
  transformRefund,
  untransformRefund,
  type RawStoreHippoRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/storehippo/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'
import { REFUND } from '../fixtures'

const raw = (): RawStoreHippoRefund => structuredClone(REFUND) as RawStoreHippoRefund
/** The Order.id (ms.orders `_id`) the adapter resolved order_id "OID-243" to. */
const ORDER_ID = '5d6f5f367ab56e2439cf2dc4'

describe('StoreHippo transformRefund (documented ms-refunds fields)', () => {
  it('maps the documented fields and parses with RefundSchema', () => {
    const r = RefundSchema.parse(transformRefund(raw(), ORDER_ID))
    expect(r).toMatchObject({
      id: '5922883b4bf74dca131e25e7',
      orderId: ORDER_ID,
      amount: { amount: 39960, currency: 'INR' },
      note: 'Damaged in transit',
      transactionIds: ['TXN-94Y2XP836'],
      createdAt: '2019-09-04T06:53:22.970Z',
    })
  })

  it('omits the amount when the record names no currency', () => {
    const r = RefundSchema.parse(
      transformRefund({ ...raw(), transaction_info: undefined }, ORDER_ID),
    )
    expect(r.amount).toBeUndefined()
    expect(r.transactionIds).toBeUndefined()
  })

  it('refundOrderNumber reads the documented order_id display number, and requires it', () => {
    expect(refundOrderNumber(raw())).toBe('OID-243')
    expect(() => refundOrderNumber({ ...raw(), order_id: undefined })).toThrow(/order_id/)
  })

  it('untransformRefund keeps the order id', () => {
    expect(untransformRefund({ orderId: 'OID-243' })['orderId']).toBe('OID-243')
  })
})
