import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/sumup/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('sumup transformBalanceTransaction', () => {
  it('maps id, amount, currency and gateway', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_001',
      object: 'balance_transaction',
      type: 'charge',
      amount: 5000,
      currency: 'usd',
      net: 4825,
      fee: 175,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('txn_001')
    expect(result.externalId).toBe('txn_001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.fee).toBe(175)
    expect(result.net).toBe(4825)
    expect(result.gateway).toBe('stripe')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('upcases currency', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_002',
      object: 'balance_transaction',
      type: 'payout',
      amount: 10000,
      currency: 'eur',
    }
    expect(transformBalanceTransaction(raw).currency).toBe('EUR')
  })

  it('maps type strings to canonical type values', () => {
    const cases: Array<{ input: string; expected: string }> = [
      { input: 'charge', expected: 'charge' },
      { input: 'charge_failure_refund', expected: 'charge' },
      { input: 'refund', expected: 'refund' },
      { input: 'payout', expected: 'payout' },
      { input: 'payout_failure', expected: 'payout' },
      { input: 'adjustment', expected: 'adjustment' },
      { input: 'application_fee', expected: 'application_fee' },
      { input: 'transfer', expected: 'transfer' },
      { input: 'dispute', expected: 'dispute' },
      { input: 'some_fee_type', expected: 'fee' },
      { input: 'unknown_type', expected: 'other' },
    ]
    for (const { input, expected } of cases) {
      const raw: RawStripeBalanceTransaction = {
        id: 'txn_t',
        object: 'balance_transaction',
        type: input,
        amount: 100,
        currency: 'usd',
      }
      expect(transformBalanceTransaction(raw).type).toBe(expected)
    }
  })

  it('maps sourceType passthrough from type field', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_003',
      object: 'balance_transaction',
      type: 'charge',
      amount: 1000,
      currency: 'usd',
      source: 'ch_src',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.sourceId).toBe('ch_src')
    expect(result.sourceType).toBe('charge')
  })

  it('maps feeDetails array with upcased currency', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_004',
      object: 'balance_transaction',
      type: 'charge',
      amount: 2000,
      currency: 'usd',
      fee_details: [
        { amount: 59, currency: 'usd', type: 'stripe_fee', description: 'Stripe processing fee' },
      ],
    }
    const result = transformBalanceTransaction(raw)
    expect(result.feeDetails).toHaveLength(1)
    expect(result.feeDetails![0].currency).toBe('USD')
    expect(result.feeDetails![0].description).toBe('Stripe processing fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps availableOn and createdAt from unix timestamps', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_005',
      object: 'balance_transaction',
      type: 'payout',
      amount: 3000,
      currency: 'usd',
      available_on: 1709251200,
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.availableOn).toBe('2024-03-01T00:00:00.000Z')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
