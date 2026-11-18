import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('truelayer transformBalanceTransaction', () => {
  it('maps a charge balance transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_tl_001',
      object: 'balance_transaction',
      type: 'charge',
      amount: 5000,
      currency: 'usd',
      net: 4825,
      fee: 175,
      source: 'ch_tl_001',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('txn_tl_001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund balance transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_tl_002',
      object: 'balance_transaction',
      type: 'refund',
      amount: -2500,
      currency: 'eur',
      net: -2500,
      created: 1709337600,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-2500)
    expect(result.currency).toBe('EUR')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps fee details when present', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_tl_003',
      object: 'balance_transaction',
      type: 'payout',
      amount: 10000,
      currency: 'gbp',
      fee: 25,
      fee_details: [{ amount: 25, currency: 'gbp', type: 'stripe_fee' }],
      net: 9975,
      created: 1709424000,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(result.feeDetails).toHaveLength(1)
    expect(result.feeDetails![0].currency).toBe('GBP')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
