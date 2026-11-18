import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('zuora transformBalanceTransaction', () => {
  it('maps id, amount, currency and type correctly', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'zuora-txn-001',
      object: 'balance_transaction',
      type: 'charge',
      amount: 9900,
      currency: 'usd',
      fee: 288,
      net: 9612,
      source: 'zuora-ch-001',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('zuora-txn-001')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('charge')
    expect(result.net).toBe(9612)
    expect(result.gateway).toBe('stripe')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps fee_details array with upcased currency', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'zuora-txn-002',
      object: 'balance_transaction',
      type: 'refund',
      amount: 5000,
      currency: 'eur',
      fee_details: [{ amount: 10, currency: 'eur', type: 'stripe_fee' }],
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.feeDetails).toHaveLength(1)
    expect(result.feeDetails![0].currency).toBe('EUR')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps transfer type from type prefix', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'zuora-txn-003',
      object: 'balance_transaction',
      type: 'transfer',
      amount: 20000,
      currency: 'gbp',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('transfer')
    expect(result.currency).toBe('GBP')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
