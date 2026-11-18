import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/payoneer/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('payoneer transformBalanceTransaction', () => {
  it('maps a charge-type balance transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_001',
      object: 'balance_transaction',
      type: 'charge',
      amount: 12500,
      currency: 'usd',
      fee: 363,
      net: 12137,
      source: 'ch_001',
      available_on: 1709251200,
      created: 1709251200,
    }

    const result = transformBalanceTransaction(raw)

    expect(result.id).toBe('txn_001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(12500)
    expect(result.currency).toBe('USD')
    expect(result.fee).toBe(363)
    expect(result.sourceId).toBe('ch_001')
    expect(result.gateway).toBe('stripe')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund-type transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_002',
      object: 'balance_transaction',
      type: 'refund',
      amount: -5000,
      currency: 'EUR',
      created: 1709251200,
    }

    const result = transformBalanceTransaction(raw)

    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-5000)
    expect(result.currency).toBe('EUR')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps fee_details into feeDetails array', () => {
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
      created: 1709251200,
    }

    const result = transformBalanceTransaction(raw)

    expect(result.feeDetails).toHaveLength(1)
    expect(result.feeDetails![0].type).toBe('stripe_fee')
    expect(result.feeDetails![0].currency).toBe('USD')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
