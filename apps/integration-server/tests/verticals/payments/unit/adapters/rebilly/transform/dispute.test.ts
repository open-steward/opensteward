import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawRebillyDispute,
} from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

// Dispute.yaml: transactionId, currency, amount, category, status, deadlineTime.
const base: RawRebillyDispute = {
  id: 'dis_1',
  transactionId: 'txn_0YVDTQJ8YWDGQACV2N2N5SPWQ0',
  currency: 'USD',
  amount: 20,
  category: 'fraud',
  status: 'response-needed',
  deadlineTime: '2026-02-01T00:00:00Z',
  createdTime: '2026-01-15T00:00:00Z',
}

describe('rebilly transformDispute', () => {
  it('maps the documented fields', () => {
    expect(DisputeSchema.parse(transformDispute(base))).toMatchObject({
      chargeId: 'txn_0YVDTQJ8YWDGQACV2N2N5SPWQ0',
      amount: 2000,
      status: 'needs_response',
      reason: 'fraudulent',
      evidenceDueBy: '2026-02-01T00:00:00Z',
    })
  })

  it.each([
    ['under-review', 'under_review'],
    ['won', 'won'],
    ['lost', 'lost'],
    ['forfeited', 'lost'],
    ['unknown', 'unknown'],
  ])('maps %s to %s', (raw, status) => {
    expect(DisputeSchema.parse(transformDispute({ ...base, status: raw })).status).toBe(status)
  })

  it('maps non-fraud categories to other', () => {
    expect(transformDispute({ ...base, category: 'processing-errors' }).reason).toBe('other')
  })

  it('throws without a disputed transaction', () => {
    expect(() => transformDispute({ ...base, transactionId: null })).toThrow(/transactionId/)
  })
})
