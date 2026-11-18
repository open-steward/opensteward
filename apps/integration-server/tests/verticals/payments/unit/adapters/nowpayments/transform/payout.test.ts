/**
 * Fixture: the "Mass payouts / List of payouts" example of the official
 * collection, https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt
 */
import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawNowpaymentsPayout,
} from '../../../../../../../src/verticals/payments/adapters/nowpayments/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

const DOC: RawNowpaymentsPayout = {
  id: '5000248325',
  batch_withdrawal_id: '5000145498',
  status: 'FINISHED',
  error: null,
  currency: 'trx',
  amount: '94.088939',
  address: '[payout address]',
  extra_id: null,
  hash: '[hash]',
  ipn_callback_url: null,
  payout_description: null,
  is_request_payouts: true,
  unique_external_id: null,
  created_at: '2023-04-06T14:44:59.684Z',
  requested_at: '2023-04-06T14:45:55.505Z',
  updated_at: '2023-04-06T14:49:08.031Z',
}

describe('nowpayments transformPayout', () => {
  it('maps the documented payout', () => {
    const p = PayoutSchema.parse(transformPayout(DOC))
    expect(p).toMatchObject({
      id: '5000248325',
      externalId: '5000248325',
      amount: 9409,
      currency: 'TRX',
      status: 'paid',
      gateway: 'nowpayments',
      createdAt: '2023-04-06T14:44:59.684Z',
      updatedAt: '2023-04-06T14:49:08.031Z',
    })
    expect(p.arrivalDate).toBeUndefined()
    expect(p.metadata).toMatchObject({
      batch_withdrawal_id: '5000145498',
      amount: '94.088939',
      hash: '[hash]',
    })
  })

  it.each([
    ['CREATING', 'pending'],
    ['WAITING', 'pending'],
    ['PROCESSING', 'in_transit'],
    ['SENDING', 'in_transit'],
    ['FINISHED', 'paid'],
    ['FAILED', 'failed'],
    ['REJECTED', 'failed'],
    ['SOMETHING_NEW', 'unknown'],
  ])('maps status %s to %s', (s, want) => {
    expect(PayoutSchema.parse(transformPayout({ ...DOC, status: s })).status).toBe(want)
  })

  it('carries error as failureMessage', () => {
    expect(
      transformPayout({ ...DOC, status: 'FAILED', error: 'Insufficient balance' }).failureMessage,
    ).toBe('Insufficient balance')
  })

  it('throws, rather than defaulting, on a missing or non-3-letter currency', () => {
    expect(() => transformPayout({ ...DOC, currency: null })).toThrow(/currency/)
    expect(() => transformPayout({ ...DOC, currency: 'usdttrc20' })).toThrow(/currency/)
  })

  it('throws on a missing amount', () => {
    expect(() => transformPayout({ ...DOC, amount: null })).toThrow(/amount/)
  })
})
