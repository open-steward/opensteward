import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawPaystackLedgerEntry,
} from '../../../../../../../src/verticals/payments/adapters/paystack/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('paystack transformBalanceTransaction', () => {
  it('maps a transaction model to type "charge"', () => {
    const raw: RawPaystackLedgerEntry = {
      id: 1001,
      currency: 'NGN',
      difference: 50000,
      reason: 'Charge for order #42',
      model_responsible: 'transaction',
      model_row: 555,
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('NGN')
    expect(result.net).toBe(50000)
    expect(result.sourceId).toBe('555')
    expect(result.description).toBe('Charge for order #42')
    expect(result.gateway).toBe('paystack')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a transfer model to type "payout"', () => {
    const raw: RawPaystackLedgerEntry = {
      id: 1002,
      currency: 'NGN',
      difference: -20000,
      reason: 'Transfer to bank',
      model_responsible: 'transfer',
      model_row: 666,
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(result.amount).toBe(-20000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund model to type "refund"', () => {
    const raw: RawPaystackLedgerEntry = {
      id: 1003,
      currency: 'NGN',
      difference: -10000,
      reason: 'Refund for order #99',
      model_responsible: 'refund',
      model_row: 777,
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-10000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown model to type "other"', () => {
    const raw: RawPaystackLedgerEntry = {
      id: 1004,
      currency: 'NGN',
      difference: 0,
      model_responsible: 'adjustment',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('other')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
