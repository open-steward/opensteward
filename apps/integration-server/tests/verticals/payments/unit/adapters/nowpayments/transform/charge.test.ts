/**
 * Fixture: the "Get list of payments" example of the official collection,
 * https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawNowpaymentsPayment,
} from '../../../../../../../src/verticals/payments/adapters/nowpayments/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const DOC: RawNowpaymentsPayment = {
  payment_id: 5592161154,
  invoice_id: 6200264890,
  payment_status: 'partially_paid',
  pay_address: 'address',
  payin_extra_id: null,
  price_amount: 1,
  price_currency: 'usd',
  pay_amount: 12.5,
  actually_paid: 10,
  pay_currency: 'trx',
  order_id: null,
  order_description: null,
  purchase_id: 5392971146,
  outcome_amount: 9.8505,
  outcome_currency: 'trx',
  payout_hash: 'hash',
  payin_hash: 'hash',
  created_at: '2023-07-19T15:22:15.807Z',
  updated_at: '2023-07-19T15:27:10.477Z',
  type: 'crypto2crypto',
  payment_extra_ids: [4526424492],
}

describe('nowpayments transformCharge', () => {
  it('maps the documented payment', () => {
    const c = ChargeSchema.parse(transformCharge(DOC))
    expect(c).toMatchObject({
      id: '5592161154',
      externalId: '5592161154',
      amount: 100,
      currency: 'USD',
      status: 'pending',
      invoiceId: '6200264890',
      gateway: 'nowpayments',
      createdAt: '2023-07-19T15:22:15.807Z',
      updatedAt: '2023-07-19T15:27:10.477Z',
    })
    expect(c.metadata).toMatchObject({
      pay_currency: 'trx',
      actually_paid: '10',
      purchase_id: '5392971146',
    })
    expect(c.description).toBeUndefined()
  })

  it('maps order_description to description', () => {
    const c = ChargeSchema.parse(
      transformCharge({ ...DOC, order_description: 'Apple Macbook Pro 2019 x 1' }),
    )
    expect(c.description).toBe('Apple Macbook Pro 2019 x 1')
  })

  it.each([
    ['waiting', 'pending'],
    ['confirming', 'pending'],
    ['confirmed', 'pending'],
    ['sending', 'pending'],
    ['partially_paid', 'pending'],
    ['finished', 'succeeded'],
    ['failed', 'failed'],
    ['refunded', 'refunded'],
    ['expired', 'cancelled'],
    ['something_new', 'unknown'],
  ])('maps payment_status %s to %s', (s, want) => {
    expect(ChargeSchema.parse(transformCharge({ ...DOC, payment_status: s })).status).toBe(want)
  })

  it('scales by the price currency exponent, not a fixed 100', () => {
    expect(transformCharge({ ...DOC, price_amount: 1000, price_currency: 'jpy' }).amount).toBe(1000)
  })

  it('throws, rather than defaulting, when price_currency is missing or not a 3-letter code', () => {
    expect(() => transformCharge({ ...DOC, price_currency: undefined })).toThrow(/currency/)
    expect(() => transformCharge({ ...DOC, price_currency: 'usdttrc20' })).toThrow(/currency/)
  })

  it('throws when price_amount is missing', () => {
    expect(() => transformCharge({ ...DOC, price_amount: null })).toThrow(/amount/)
  })

  it('throws when payment_id is missing', () => {
    expect(() => transformCharge({ ...DOC, payment_id: undefined })).toThrow(/missing id/)
  })
})
