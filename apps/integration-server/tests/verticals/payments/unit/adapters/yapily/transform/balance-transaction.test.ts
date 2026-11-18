import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/yapily/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('yapily transformBalanceTransaction (stripe-scaffold)', () => {
  it('maps a charge type to "charge" and sets amount/currency', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn-001',
      object: 'balance_transaction',
      type: 'charge',
      amount: 5000,
      currency: 'gbp',
      fee: 145,
      net: 4855,
      source: 'ch-001',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('GBP')
    expect(result.fee).toBe(145)
    expect(result.net).toBe(4855)
    expect(result.gateway).toBe('stripe')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund type to "refund"', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn-002',
      object: 'balance_transaction',
      type: 'refund',
      amount: -2500,
      currency: 'usd',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-2500)
    expect(result.currency).toBe('USD')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps fee_details when present', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn-003',
      object: 'balance_transaction',
      type: 'charge',
      amount: 10000,
      currency: 'eur',
      fee: 320,
      fee_details: [
        { amount: 320, currency: 'eur', type: 'stripe_fee', description: 'Stripe fee' },
      ],
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.feeDetails).toHaveLength(1)
    expect(result.feeDetails![0].type).toBe('stripe_fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
