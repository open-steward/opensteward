import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('bridge-open-banking transformBalanceTransaction', () => {
  it('maps a charge balance transaction with fee details', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn-001',
      object: 'balance_transaction',
      type: 'charge',
      amount: 5000,
      currency: 'usd',
      fee: 175,
      net: 4825,
      fee_details: [
        { amount: 175, currency: 'usd', type: 'stripe_fee', description: 'Stripe processing fee' },
      ],
      source: 'ch_001',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('txn-001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.fee).toBe(175)
    expect(result.net).toBe(4825)
    expect(result.sourceId).toBe('ch_001')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund balance transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn-002',
      object: 'balance_transaction',
      type: 'refund',
      amount: -1000,
      currency: 'eur',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-1000)
    expect(result.currency).toBe('EUR')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a payout balance transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn-003',
      object: 'balance_transaction',
      type: 'payout',
      amount: 50000,
      currency: 'usd',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
