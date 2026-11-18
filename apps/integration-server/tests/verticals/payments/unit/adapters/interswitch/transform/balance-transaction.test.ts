import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/interswitch/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('interswitch transformBalanceTransaction', () => {
  it('maps a charge transaction correctly', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_001',
      object: 'balance_transaction',
      type: 'charge',
      amount: 5000,
      currency: 'usd',
      fee: 175,
      net: 4825,
      source: 'ch_001',
      description: 'Test charge',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.fee).toBe(175)
    expect(result.net).toBe(4825)
    expect(result.gateway).toBe('stripe')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund transaction type', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_002',
      object: 'balance_transaction',
      type: 'refund',
      amount: -2500,
      currency: 'usd',
      net: -2500,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-2500)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps fee_details to feeDetails array', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_003',
      object: 'balance_transaction',
      type: 'charge',
      amount: 10000,
      currency: 'usd',
      fee: 320,
      fee_details: [
        { amount: 320, currency: 'usd', type: 'stripe_fee', description: 'Stripe processing fee' },
      ],
      net: 9680,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.feeDetails).toHaveLength(1)
    expect(result.feeDetails![0].type).toBe('stripe_fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
