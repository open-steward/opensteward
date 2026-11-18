/**
 * Fixture: the first row of the documented GET /underwriting/disputes
 * response example, https://docs.staxpayments.com/reference/list-disputes
 */
import { describe, it, expect } from 'vitest'
import { transformDispute } from '../../../../../../../src/verticals/payments/adapters/stax-payments/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

const DOC_ROW = {
  id: '07ad9751-443c-11ea-8e3f-0242ac140002',
  transaction_id: '000e8694-d259-47ee-8fa1-bc0667e705a5',
  merchant_id: 'merchant1',
  reason: 'FRAUD',
  amount: 8888.88,
  status: 'PENDING',
  respond_by: '2020-01-20T23:48:03.000Z',
  created_at: '2020-01-08T23:48:03.000Z',
  updated_at: '2020-01-08T23:48:03.000Z',
}

describe('stax-payments transformDispute', () => {
  it('maps the documented dispute example in the merchant currency', () => {
    const d = DisputeSchema.parse(transformDispute(DOC_ROW, 'USD'))
    expect(d.id).toBe('07ad9751-443c-11ea-8e3f-0242ac140002')
    expect(d.chargeId).toBe('000e8694-d259-47ee-8fa1-bc0667e705a5')
    expect(d.amount).toBe(888888)
    expect(d.currency).toBe('USD')
    expect(d.reason).toBe('fraudulent')
    expect(d.status).toBe('unknown')
    expect(d.evidenceDueBy).toBe('2020-01-20T23:48:03.000Z')
    expect(d.createdAt).toBe('2020-01-08T23:48:03.000Z')
  })

  it('throws on a dispute without a transaction_id or amount', () => {
    expect(() => transformDispute({ ...DOC_ROW, transaction_id: null }, 'USD')).toThrow(
      /transaction_id/,
    )
    expect(() => transformDispute({ ...DOC_ROW, amount: null }, 'USD')).toThrow(/has no amount/)
  })
})
