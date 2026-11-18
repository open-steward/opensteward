import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawModernTreasuryTransaction,
} from '../../../../../../../src/verticals/payments/adapters/modern-treasury/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('modern-treasury transformBalanceTransaction', () => {
  it('maps an ACH credit transaction to type "payout" with positive amount', () => {
    const raw: RawModernTreasuryTransaction = {
      id: 'txn-001',
      type: 'ach',
      direction: 'credit',
      amount: 10000,
      currency: 'USD',
      status: 'posted',
      description: 'ACH credit',
      internal_account_id: 'acct-001',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('txn-001')
    expect(result.type).toBe('payout')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('modern-treasury')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a card debit transaction to type "charge" with negative amount', () => {
    const raw: RawModernTreasuryTransaction = {
      id: 'txn-002',
      type: 'card',
      direction: 'debit',
      amount: 5000,
      currency: 'USD',
      status: 'posted',
      vendor_id: 'charge-001',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('charge')
    // debit amounts are negated
    expect(result.amount).toBe(-5000)
    expect(result.sourceId).toBe('charge-001')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a fee transaction to type "fee"', () => {
    const raw: RawModernTreasuryTransaction = {
      id: 'txn-003',
      type: 'fee',
      direction: 'debit',
      amount: 200,
      currency: 'USD',
      status: 'posted',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('fee')
    expect(result.amount).toBe(-200)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a book transfer to type "transfer"', () => {
    const raw: RawModernTreasuryTransaction = {
      id: 'txn-004',
      type: 'book',
      direction: 'credit',
      amount: 3000,
      currency: 'USD',
      status: 'reconciled',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('transfer')
    expect(result.amount).toBe(3000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
