import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('stitch transformBalanceTransaction', () => {
  it('maps id, amount, currency, and gateway fields', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_001',
      object: 'balance_transaction',
      type: 'charge',
      amount: 10000,
      currency: 'usd',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('txn_stitch_001')
    expect(result.externalId).toBe('txn_stitch_001')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
  })

  it('upper-cases currency', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_002',
      object: 'balance_transaction',
      type: 'payout',
      amount: 5000,
      currency: 'eur',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.currency).toBe('EUR')
  })

  it('maps type "charge" from Stripe charge type', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_003',
      object: 'balance_transaction',
      type: 'charge',
      amount: 9900,
      currency: 'usd',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('charge')
  })

  it('maps type "refund" from Stripe refund type', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_004',
      object: 'balance_transaction',
      type: 'refund',
      amount: -2000,
      currency: 'usd',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
  })

  it('maps type "payout" from Stripe payout type', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_005',
      object: 'balance_transaction',
      type: 'payout',
      amount: -50000,
      currency: 'usd',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
  })

  it('maps type "dispute" from Stripe dispute type', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_006',
      object: 'balance_transaction',
      type: 'dispute',
      amount: -10000,
      currency: 'usd',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('dispute')
  })

  it('maps fee, net, sourceId, and sourceType fields', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_007',
      object: 'balance_transaction',
      type: 'charge',
      amount: 10000,
      currency: 'usd',
      fee: 320,
      net: 9680,
      source: 'ch_001',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.fee).toBe(320)
    expect(result.net).toBe(9680)
    expect(result.sourceId).toBe('ch_001')
    expect(result.sourceType).toBe('charge')
  })

  it('maps fee_details to feeDetails with upper-cased currency', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_008',
      object: 'balance_transaction',
      type: 'charge',
      amount: 10000,
      currency: 'usd',
      fee: 320,
      fee_details: [
        { amount: 320, currency: 'usd', type: 'stripe_fee', description: 'Stripe processing fee' },
      ],
    }
    const result = transformBalanceTransaction(raw)
    expect(result.feeDetails).toHaveLength(1)
    expect(result.feeDetails![0].amount).toBe(320)
    expect(result.feeDetails![0].currency).toBe('USD')
    expect(result.feeDetails![0].type).toBe('stripe_fee')
    expect(result.feeDetails![0].description).toBe('Stripe processing fee')
  })

  it('converts unix available_on to ISO string', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_009',
      object: 'balance_transaction',
      type: 'charge',
      amount: 5000,
      currency: 'usd',
      available_on: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.availableOn).toBe('2024-03-01T00:00:00.000Z')
  })

  it('converts unix created to ISO string', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_010',
      object: 'balance_transaction',
      type: 'charge',
      amount: 5000,
      currency: 'usd',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes BalanceTransactionSchema validation', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_stitch_011',
      object: 'balance_transaction',
      type: 'charge',
      amount: 15000,
      currency: 'gbp',
      fee: 480,
      net: 14520,
      source: 'ch_099',
      description: 'Payment for order #99',
      available_on: 1709251200,
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
