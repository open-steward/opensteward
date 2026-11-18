import { describe, it, expect } from 'vitest'
import { transformBalanceTransaction } from '../../../../../../../src/verticals/payments/adapters/belvo/transform/balance-transaction'
import type { RawBelvoTransaction } from '../../../../../../../src/verticals/payments/adapters/belvo/transform/charge'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('belvo transformBalanceTransaction', () => {
  it('maps an OUTFLOW transaction with a negative amount', () => {
    const raw: RawBelvoTransaction = {
      id: 'belvo-txn-001',
      currency: 'BRL',
      amount: 150.75,
      type: 'OUTFLOW',
      status: 'PROCESSED',
      description: 'Rent payment',
      value_date: '2024-03-01',
      collected_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('belvo-txn-001')
    expect(result.amount).toBe(-15075)
    expect(result.currency).toBe('BRL')
    expect(result.type).toBe('other')
    expect(result.gateway).toBe('belvo')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps an INFLOW transaction with a positive amount', () => {
    const raw: RawBelvoTransaction = {
      id: 'belvo-txn-002',
      currency: 'MXN',
      amount: 5000.0,
      type: 'INFLOW',
      status: 'PROCESSED',
      description: 'Salary',
      value_date: '2024-03-01',
      collected_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.amount).toBe(500000)
    expect(result.currency).toBe('MXN')
    expect(result.description).toBe('Salary')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('uses account currency when transaction currency is absent', () => {
    const raw: RawBelvoTransaction = {
      id: 'belvo-txn-003',
      account: {
        id: 'acct-001',
        currency: 'COP',
      },
      amount: 200.0,
      type: 'INFLOW',
      status: 'PROCESSED',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.currency).toBe('COP')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('sets sourceId to the transaction id', () => {
    const raw: RawBelvoTransaction = {
      id: 'belvo-txn-004',
      currency: 'BRL',
      amount: 75.5,
      type: 'OUTFLOW',
      status: 'PROCESSED',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.sourceId).toBe('belvo-txn-004')
    expect(result.sourceType).toBe('transaction')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
