import { describe, it, expect } from 'vitest'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/payout'
import type { RawRebillyTransaction } from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/charge'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

// PostPayout: "Creates a transaction of type `credit`." Fields from Transaction.yaml.
const base: RawRebillyTransaction = {
  id: 'txn_credit_1',
  type: 'credit',
  status: 'completed',
  result: 'approved',
  amount: 100,
  currency: 'USD',
  createdTime: '2026-01-15T09:30:00Z',
}

describe('rebilly transformPayout', () => {
  it('maps a completed credit transaction to a paid payout', () => {
    expect(PayoutSchema.parse(transformPayout(base))).toMatchObject({
      id: 'txn_credit_1',
      amount: 10000,
      currency: 'USD',
      status: 'paid',
    })
  })

  it.each([
    [{ result: 'declined' }, 'failed'],
    [{ status: 'voided' }, 'cancelled'],
    [{ status: 'pending', result: 'unknown' }, 'pending'],
    [{ status: 'never-sent', result: 'unknown' }, 'unknown'],
  ] as const)('maps %o to %s', (patch, status) => {
    expect(PayoutSchema.parse(transformPayout({ ...base, ...patch })).status).toBe(status)
  })

  it('throws without an amount', () => {
    expect(() => transformPayout({ ...base, amount: undefined })).toThrow(/amount/)
  })

  it('does not call a completed credit paid unless the result is approved', () => {
    expect(PayoutSchema.parse(transformPayout({ ...base, result: 'unknown' })).status).toBe(
      'unknown',
    )
  })
})
