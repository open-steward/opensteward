import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('triple-a transformBalanceTransaction', () => {
  it('maps a payout transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn-ta-001',
      object: 'balance_transaction',
      type: 'payout',
      amount: 50000,
      currency: 'usd',
      fee: 0,
      net: 50000,
      source: 'po-001',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('txn-ta-001')
    expect(result.type).toBe('payout')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('USD')
    expect(result.sourceId).toBe('po-001')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a dispute transaction and maps type correctly', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn-ta-002',
      object: 'balance_transaction',
      type: 'dispute',
      amount: -3000,
      currency: 'EUR',
      net: -3000,
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('dispute')
    expect(result.currency).toBe('EUR')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
