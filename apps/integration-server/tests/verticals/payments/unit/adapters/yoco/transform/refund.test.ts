import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/yoco/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'
import { REFUND } from '../fixtures'

describe('yoco transformRefund (documented Refund)', () => {
  it('maps the documented example refund', () => {
    const r = RefundSchema.parse(transformRefund(REFUND))
    expect(r.id).toBe('1732188199292-2a8752ab-db45-4507-9d85-fcc6049beef3')
    expect(r.chargeId).toBe('1732194482873-c777dc85-035e-40de-9820-765fde5ded7b')
    expect(r.amount).toBe(4500)
    expect(r.currency).toBe('ZAR')
    expect(r.status).toBe('succeeded')
    expect(r.receiptNumber).toBe('491352')
    expect(r.createdAt).toBe('2024-11-19T15:27:02+00:00')
    expect(r.updatedAt).toBe('2024-11-19T16:27:23+00:00')
    expect(r.metadata).toMatchObject({ refund_type: 'auth_reversal', status: 'approved' })
  })

  it.each([
    ['approved', 'succeeded'],
    ['pending', 'pending'],
    ['failed', 'failed'],
    ['rejected', 'failed'],
    ['other', 'unknown'],
  ])('maps RefundStatus %s to %s', (status, want) => {
    expect(RefundSchema.parse(transformRefund({ ...REFUND, status })).status).toBe(want)
  })

  it('throws when payment_id is missing', () => {
    expect(() => transformRefund({ ...REFUND, payment_id: '' })).toThrow(/payment_id/)
  })
})
