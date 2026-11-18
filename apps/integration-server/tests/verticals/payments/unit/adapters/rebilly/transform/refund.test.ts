import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/refund'
import type { RawRebillyTransaction } from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/charge'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

// Transaction.yaml: type enum includes `refund`; parentTransactionId "ID of the parent transaction."
const base: RawRebillyTransaction = {
  id: 'txn_refund_1',
  type: 'refund',
  status: 'completed',
  result: 'approved',
  amount: 12.5,
  currency: 'EUR',
  parentTransactionId: 'txn_parent_1',
  createdTime: '2026-01-15T09:30:00Z',
}

describe('rebilly transformRefund', () => {
  it('maps a completed refund to its parent charge', () => {
    const r = RefundSchema.parse(transformRefund(base))
    expect(r).toMatchObject({
      chargeId: 'txn_parent_1',
      amount: 1250,
      currency: 'EUR',
      status: 'succeeded',
    })
  })

  it.each([
    [{ result: 'declined' }, 'failed'],
    [{ status: 'voided' }, 'cancelled'],
    [{ status: 'waiting-refund', result: 'unknown' }, 'pending'],
    [{ status: 'timeout', result: 'unknown' }, 'unknown'],
  ] as const)('maps %o to %s', (patch, status) => {
    expect(RefundSchema.parse(transformRefund({ ...base, ...patch })).status).toBe(status)
  })

  it('throws without a parent transaction', () => {
    expect(() => transformRefund({ ...base, parentTransactionId: null })).toThrow(
      /parentTransactionId/,
    )
  })
})
