import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('zip-bnpl transformBalanceTransaction', () => {
  it('maps id, amount, currency and type correctly', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'zip-txn-001',
      object: 'balance_transaction',
      type: 'charge',
      amount: 5000,
      currency: 'usd',
      fee: 145,
      net: 4855,
      source: 'ch-001',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('zip-txn-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('charge')
    expect(result.net).toBe(4855)
    expect(result.gateway).toBe('stripe')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps fee_details into feeDetails array', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'zip-txn-002',
      object: 'balance_transaction',
      type: 'payout',
      amount: 10000,
      currency: 'eur',
      fee_details: [
        { amount: 25, currency: 'eur', type: 'stripe_fee', description: 'Stripe processing fee' },
      ],
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(result.feeDetails).toHaveLength(1)
    expect(result.feeDetails![0].currency).toBe('EUR')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps refund type from type prefix', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'zip-txn-003',
      object: 'balance_transaction',
      type: 'refund',
      amount: 2000,
      currency: 'gbp',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.currency).toBe('GBP')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
