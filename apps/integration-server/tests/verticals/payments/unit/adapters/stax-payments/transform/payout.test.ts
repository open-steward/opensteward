/**
 * Fixture: the first row of the documented GET /query/deposit response
 * example, https://docs.staxpayments.com/reference/get-list-of-deposits
 */
import { describe, it, expect } from 'vitest'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/stax-payments/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

const DOC_ROW = {
  batched_at: '2019-01-01',
  batch_id: '00001',
  last_transaction: '2019-01-01T18:38:00.000Z',
  count: 29,
  sum: 1379.65,
  avg: 47.57,
  min: 10,
  max: 199.93,
  std: 33.82,
}

describe('stax-payments transformPayout', () => {
  it('maps the documented deposit example in the merchant currency', () => {
    const p = PayoutSchema.parse(transformPayout(DOC_ROW, 'USD'))
    expect(p.id).toBe('00001')
    expect(p.amount).toBe(137965)
    expect(p.currency).toBe('USD')
    expect(p.status).toBe('unknown')
    expect(p.arrivalDate).toBeUndefined()
    expect(p.createdAt).toBe('2019-01-01T00:00:00.000Z')
  })

  it('throws on a deposit without a batch_id or sum', () => {
    expect(() => transformPayout({ ...DOC_ROW, batch_id: undefined }, 'USD')).toThrow(/has no id/)
    expect(() => transformPayout({ ...DOC_ROW, sum: null }, 'USD')).toThrow(/has no sum/)
  })
})
