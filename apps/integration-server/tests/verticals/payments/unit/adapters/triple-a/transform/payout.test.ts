/**
 * Fixture values are the `example:` values of `PayoutCrypto` in the vendor's
 * Crypto-Payouts.yaml
 * (https://developers.triple-a.io/api/v1/projects/triplea-technologies/triplea-api-doc/nodes/references/Crypto-Payouts.yaml).
 */
import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawTripleAPayout,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

const DOCUMENTED: RawTripleAPayout = {
  payout_reference: 'AGJ-937870-PYT',
  order_id: '<your_order_id>',
  type: 'withdraw',
  account_type: 'local',
  convert_type: 'local-crypto',
  payout_destination_type: 'onchain-wallet',
  local_currency: 'SGD',
  local_amount: 10,
  crypto_currency: 'testBTC',
  crypto_amount: 0.001067203,
  network_fee_crypto_amount: 0.000007203,
  network_fee_fiat_amt: 0.123,
  net_crypto_amount: 0.00106,
  crypto_address: '1NcAyv8YVCnQGCrDb4kiUm1jj6GLyowxER',
  exchange_rate: 10277.49,
  status: 'new',
  status_date: '2020-01-26T03:57:22Z',
  merchant_name: 'A to Z Toys and Games',
  remarks: 'Refund for a water pistol',
}

describe('triple-a transformPayout', () => {
  it('maps the documented PayoutCrypto example to a canonical Payout', () => {
    const result = PayoutSchema.parse(transformPayout(DOCUMENTED))
    expect(result.id).toBe('AGJ-937870-PYT')
    expect(result.externalId).toBe('AGJ-937870-PYT')
    // local_amount 10 SGD in minor units
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('SGD')
    expect(result.status).toBe('pending')
    expect(result.updatedAt).toBe('2020-01-26T03:57:22Z')
    expect(result.createdAt).toBeUndefined()
    expect(result.gateway).toBe('triple-a')
    expect(result.metadata).toEqual({
      type: 'withdraw',
      order_id: '<your_order_id>',
      crypto_currency: 'testBTC',
      crypto_amount: '0.001067203',
      remarks: 'Refund for a water pistol',
    })
  })

  it.each([
    ['new', 'pending'],
    ['confirm', 'pending'],
    ['done', 'paid'],
    ['cancel', 'cancelled'],
    ['something-new', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    const result = PayoutSchema.parse(transformPayout({ ...DOCUMENTED, status }))
    expect(result.status).toBe(expected)
  })

  it('throws instead of inventing an id, currency or amount', () => {
    expect(() => transformPayout({ ...DOCUMENTED, payout_reference: undefined })).toThrow(
      /payout_reference/,
    )
    expect(() => transformPayout({ ...DOCUMENTED, local_currency: undefined })).toThrow(
      /local_currency/,
    )
    expect(() => transformPayout({ ...DOCUMENTED, local_amount: undefined })).toThrow(
      /local_amount/,
    )
  })
})
