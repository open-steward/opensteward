/**
 * A refund is a transaction of type refund, "linked to the original
 * transaction via the reference_id"
 * (https://docs.staxpayments.com/reference/refund-transaction). The fixture
 * is the documented transaction example with those two fields set.
 */
import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/stax-payments/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

const DOC_REFUND = {
  id: 'b5a8f0a4-3f1e-4c1c-9d51-0a4c1c0d2a11',
  type: 'refund',
  reference_id: '1f615a4d-23d7-4b84-9400-7a7cf088d39c',
  customer_id: 'a32bd442-dfe1-4863-8992-513d671e8d9a',
  total: 12.5,
  currency: 'USD',
  status: 'SUCCESS',
  created_at: '2025-05-22 10:00:00',
  updated_at: '2025-05-22 10:00:01',
}

describe('stax-payments transformRefund', () => {
  it('maps a refund transaction onto its parent charge', () => {
    const r = RefundSchema.parse(transformRefund(DOC_REFUND, 'USD'))
    expect(r.id).toBe('b5a8f0a4-3f1e-4c1c-9d51-0a4c1c0d2a11')
    expect(r.chargeId).toBe('1f615a4d-23d7-4b84-9400-7a7cf088d39c')
    expect(r.amount).toBe(1250)
    expect(r.currency).toBe('USD')
    expect(r.status).toBe('succeeded')
    expect(r.createdAt).toBe('2025-05-22T10:00:00.000Z')
  })

  it('throws when the refund names no parent transaction', () => {
    expect(() => transformRefund({ ...DOC_REFUND, reference_id: '' }, 'USD')).toThrow(
      /reference_id/,
    )
  })

  it('throws on a refund without a total rather than reporting 0', () => {
    expect(() => transformRefund({ ...DOC_REFUND, total: undefined }, 'USD')).toThrow(
      /has no total/,
    )
  })
})
