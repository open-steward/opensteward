/**
 * Fixture built from the RefundDetails schema's documented examples in
 * https://developer.allegro.pl/swagger.yaml (GET /payments/refunds).
 */
import { describe, expect, it } from 'vitest'
import {
  transformRefundDetails,
  type RawAllegroRefundDetails,
} from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/payment-refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawAllegroRefundDetails> = {}): RawAllegroRefundDetails {
  return {
    id: '09f0b4cc-7880-11e9-8f9e-2a86e4085a59',
    payment: { id: 'a6bee8b2-8b4e-11e9-8918-07b31163120a' },
    order: { id: 'a114b176-4833-451c-84dc-c37463793417' },
    reason: 'REFUND',
    status: 'SUCCESS',
    createdAt: '2017-05-17T08:36:57.292+02:00',
    totalValue: { amount: '123.45', currency: 'PLN' },
    sellerComment: 'Example seller comment.',
    ...overrides,
  }
}

describe('transformRefundDetails (Allegro)', () => {
  it('maps the documented RefundDetails fields and parses as a Refund', () => {
    const raw = makeRefund()
    const r = RefundSchema.parse(transformRefundDetails(raw))
    expect(r).toEqual({
      id: '09f0b4cc-7880-11e9-8f9e-2a86e4085a59',
      orderId: 'a114b176-4833-451c-84dc-c37463793417',
      amount: { amount: 12345, currency: 'PLN' },
      reason: 'REFUND',
      note: 'Example seller comment.',
      createdAt: '2017-05-17T08:36:57.292+02:00',
      metadata: raw,
    })
  })

  it('omits the amount when totalValue is absent instead of inventing one', () => {
    const r = RefundSchema.parse(transformRefundDetails(makeRefund({ totalValue: undefined })))
    expect(r).not.toHaveProperty('amount')
  })

  it('throws when the refund names no order', () => {
    expect(() => transformRefundDetails(makeRefund({ order: undefined }))).toThrow(/order\.id/)
  })
})
