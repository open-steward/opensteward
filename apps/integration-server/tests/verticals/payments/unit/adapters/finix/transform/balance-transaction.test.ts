import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawFinixBalanceEntry,
} from '../../../../../../../src/verticals/payments/adapters/finix/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('finix transformBalanceTransaction', () => {
  it('maps a DEBIT type entry to type "charge"', () => {
    const raw: RawFinixBalanceEntry = {
      id: 'BEi1',
      amount: 5000,
      currency: 'USD',
      type: 'MERCHANT_DEBIT',
      entity_id: 'TRf1',
      entity_type: 'TRANSFER',
      state: 'SUCCEEDED',
      posted_at: '2024-03-01T00:00:00.000Z',
      created_at: '2024-03-01T00:00:00.000Z',
      updated_at: '2024-03-01T00:00:00.000Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('BEi1')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.sourceId).toBe('TRf1')
    expect(result.sourceType).toBe('TRANSFER')
    expect(result.gateway).toBe('finix')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a REVERSAL type entry to type "refund"', () => {
    const raw: RawFinixBalanceEntry = {
      id: 'BEi2',
      amount: 1000,
      currency: 'USD',
      type: 'MERCHANT_REVERSAL',
      entity_id: 'TRr1',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a SETTLEMENT type entry to type "payout"', () => {
    const raw: RawFinixBalanceEntry = {
      id: 'BEi3',
      amount: 9000,
      currency: 'USD',
      type: 'MERCHANT_SETTLEMENT',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps BALANCE_ADJUSTMENT entity_type to type "adjustment"', () => {
    const raw: RawFinixBalanceEntry = {
      id: 'BEi4',
      amount: 200,
      currency: 'USD',
      type: 'UNKNOWN_TYPE',
      entity_type: 'BALANCE_ADJUSTMENT',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('adjustment')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('uses posted_at for availableOn', () => {
    const raw: RawFinixBalanceEntry = {
      id: 'BEi5',
      amount: 3000,
      currency: 'USD',
      type: 'MERCHANT_DEBIT',
      posted_at: '2024-03-01T00:00:00.000Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.availableOn).toBe('2024-03-01T00:00:00.000Z')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('stores description in the result', () => {
    const raw: RawFinixBalanceEntry = {
      id: 'BEi6',
      amount: 500,
      currency: 'USD',
      type: 'FEE',
      description: 'Processing fee',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('fee')
    expect(result.description).toBe('Processing fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
