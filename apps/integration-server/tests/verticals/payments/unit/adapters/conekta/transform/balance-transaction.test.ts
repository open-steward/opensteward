import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawConektaTransaction,
} from '../../../../../../../src/verticals/payments/adapters/conekta/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('conekta transformBalanceTransaction', () => {
  it('maps a charge transaction with correct type and amount', () => {
    const raw: RawConektaTransaction = {
      id: 'txn-001',
      type: 'charge',
      amount: 4999,
      currency: 'MXN',
      fee: 200,
      net: 4799,
      charge: 'ch-001',
      created_at: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('MXN')
    expect(result.fee).toBe(200)
    expect(result.net).toBe(4799)
    expect(result.sourceId).toBe('ch-001')
    expect(result.gateway).toBe('conekta')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund transaction to type "refund"', () => {
    const raw: RawConektaTransaction = {
      id: 'txn-002',
      type: 'refund',
      amount: 1000,
      currency: 'MXN',
      created_at: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(1000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a payout/transfer transaction to type "payout"', () => {
    const raw: RawConektaTransaction = {
      id: 'txn-003',
      type: 'transfer',
      amount: 10000,
      currency: 'MXN',
      created_at: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
