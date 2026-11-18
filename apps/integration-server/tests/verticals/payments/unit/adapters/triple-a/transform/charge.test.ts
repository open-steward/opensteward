/**
 * Fixture values are the `example:` values of `PaymentCommon01`, `Payment`,
 * `PaymentDetails02` and `Payer` in the vendor's Crypto-Payments.yaml
 * (https://developers.triple-a.io/api/v1/projects/triplea-technologies/triplea-api-doc/nodes/references/Crypto-Payments.yaml).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawTripleAPayment,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const DOCUMENTED: RawTripleAPayment = {
  type: 'triplea',
  payment_reference: 'SDF-453672-PMT',
  crypto_currency: 'testBTC',
  crypto_address: '1NcAyv8YVCnQGCrDb4kiUm1jj6GLyowxER',
  crypto_amount: 0.001067203,
  order_currency: 'USD',
  order_amount: 10,
  exchange_rate: 9370.28,
  status: 'good',
  status_date: '2020-01-26T03:57:22Z',
  receive_amount: 10,
  payment_tier: 'good',
  payment_tier_date: '2021-11-14T02:36:01.557Z',
  payment_currency: 'USD',
  payment_amount: 10,
  payment_crypto_amount: 0.00001234,
  refundable: true,
  crypto_uri: 'testbitcoin:1NcAyv8YVCnQGCrDb4kiUm1jj6GLyowxER?amount=0.001067203',
  expires_in: 1499,
  site_name: 'Triple-A Gift Cards Pte Ltd',
  remain_crypto_amount: 0.001067203,
}

describe('triple-a transformCharge', () => {
  it('maps the documented Payment example to a canonical Charge', () => {
    const result = ChargeSchema.parse(transformCharge({ ...DOCUMENTED, payer_id: 'payer-42' }))
    expect(result.id).toBe('SDF-453672-PMT')
    expect(result.externalId).toBe('SDF-453672-PMT')
    // order_amount 10 USD in minor units
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.customerId).toBe('payer-42')
    expect(result.updatedAt).toBe('2020-01-26T03:57:22Z')
    expect(result.createdAt).toBeUndefined()
    expect(result.gateway).toBe('triple-a')
    expect(result.metadata).toEqual({
      type: 'triplea',
      crypto_currency: 'testBTC',
      crypto_amount: '0.001067203',
      crypto_address: '1NcAyv8YVCnQGCrDb4kiUm1jj6GLyowxER',
    })
  })

  it.each([
    ['none', 'pending'],
    ['short', 'pending'],
    ['hold', 'pending'],
    ['good', 'succeeded'],
    ['invalid', 'failed'],
    ['something-new', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    const result = ChargeSchema.parse(transformCharge({ ...DOCUMENTED, status }))
    expect(result.status).toBe(expected)
  })

  it('scales order_amount by the currency exponent', () => {
    const result = ChargeSchema.parse(
      transformCharge({ ...DOCUMENTED, order_currency: 'jpy', order_amount: 1500 }),
    )
    expect(result.currency).toBe('JPY')
    expect(result.amount).toBe(1500)
  })

  it('throws instead of inventing an id, currency or amount', () => {
    expect(() => transformCharge({ ...DOCUMENTED, payment_reference: undefined })).toThrow(
      /payment_reference/,
    )
    expect(() => transformCharge({ ...DOCUMENTED, order_currency: undefined })).toThrow(
      /order_currency/,
    )
    expect(() => transformCharge({ ...DOCUMENTED, order_amount: undefined })).toThrow(
      /order_amount/,
    )
  })
})
