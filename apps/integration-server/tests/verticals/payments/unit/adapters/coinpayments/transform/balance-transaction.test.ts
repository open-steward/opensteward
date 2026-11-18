import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawCoinpaymentsWalletTransaction,
} from '../../../../../../../src/verticals/payments/adapters/coinpayments/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('coinpayments transformBalanceTransaction', () => {
  it('maps a "deposit" transaction to type "charge"', () => {
    const raw: RawCoinpaymentsWalletTransaction = {
      id: 'txn-001',
      type: 'deposit',
      status: 'completed',
      amount: { currencyId: 'USD', value: '50000', displayValue: '500.00' },
      txHash: 'abc123def456',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('txn-001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('coinpayments')
    expect(result.description).toBe('tx abc123def456')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a "spend" transaction to type "payout"', () => {
    const raw: RawCoinpaymentsWalletTransaction = {
      id: 'txn-002',
      type: 'spend',
      status: 'completed',
      amount: { currencyId: 'BTC', value: '100000', displayValue: '0.00100000' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(result.currency).toBe('BTC')
    expect(result.amount).toBe(100000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a "fee" transaction to type "fee"', () => {
    const raw: RawCoinpaymentsWalletTransaction = {
      id: 'txn-003',
      type: 'fee',
      amount: { currencyId: 'USD', value: '100', displayValue: '1.00' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a "transfer" transaction to type "transfer"', () => {
    const raw: RawCoinpaymentsWalletTransaction = {
      id: 'txn-004',
      type: 'transfer',
      amount: { currencyId: 'USD', value: '20000', displayValue: '200.00' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('transfer')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('includes fee amount when fee slot is present and links invoiceId as sourceId', () => {
    const raw: RawCoinpaymentsWalletTransaction = {
      id: 'txn-005',
      type: 'deposit',
      amount: { currencyId: 'USD', value: '10000', displayValue: '100.00' },
      fee: { currencyId: 'USD', value: '200', displayValue: '2.00' },
      invoiceId: 'inv-999',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.fee).toBe(200)
    expect(result.sourceId).toBe('inv-999')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
