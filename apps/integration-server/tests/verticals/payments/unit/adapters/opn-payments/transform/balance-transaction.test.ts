import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawOpnTransaction,
} from '../../../../../../../src/verticals/payments/adapters/opn-payments/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('opn-payments transformBalanceTransaction', () => {
  it('maps credit charge transaction to canonical balance transaction', () => {
    const raw: RawOpnTransaction = {
      id: 'trxn_test_123',
      amount: 50000,
      currency: 'thb',
      direction: 'credit',
      key: 'charge.captured.net',
      origin: 'chrg_test_456',
      transferable_at: '2024-03-08T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('trxn_test_123')
    expect(result.externalId).toBe('trxn_test_123')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('THB')
    expect(result.sourceId).toBe('chrg_test_456')
    expect(result.sourceType).toBe('charge')
    expect(result.description).toBe('charge.captured.net')
    expect(result.availableOn).toBe('2024-03-08T00:00:00Z')
    expect(result.gateway).toBe('opn-payments')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('negates amount for debit transactions', () => {
    const raw: RawOpnTransaction = {
      id: 'trxn_debit',
      amount: 1000,
      currency: 'thb',
      direction: 'debit',
      key: 'refund.created',
      origin: 'rfnd_test_789',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.amount).toBe(-1000)
    expect(result.type).toBe('refund')
    expect(result.sourceType).toBe('refund')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps transfer key to payout type', () => {
    const raw: RawOpnTransaction = {
      id: 'trxn_transfer',
      amount: 200000,
      currency: 'thb',
      direction: 'debit',
      key: 'transfer.paid',
      origin: 'trsf_test_001',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(result.sourceType).toBe('transfer')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps dispute key to dispute type', () => {
    const raw: RawOpnTransaction = {
      id: 'trxn_dispute',
      amount: 30000,
      currency: 'thb',
      direction: 'debit',
      key: 'dispute.created',
      origin: 'dspt_test_001',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('dispute')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps fee key to fee type', () => {
    const raw: RawOpnTransaction = {
      id: 'trxn_fee',
      amount: 925,
      currency: 'thb',
      direction: 'debit',
      key: 'fee.charged',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps unknown key to other type', () => {
    const raw: RawOpnTransaction = {
      id: 'trxn_other',
      amount: 100,
      currency: 'thb',
      direction: 'credit',
      key: 'adjustment.manual',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('other')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to THB when missing', () => {
    const raw: RawOpnTransaction = {
      id: 'trxn_nocur',
      amount: 5000,
      direction: 'credit',
      key: 'charge.captured',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.currency).toBe('THB')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('omits sourceId when origin is absent', () => {
    const raw: RawOpnTransaction = {
      id: 'trxn_noorigin',
      amount: 100,
      currency: 'thb',
      direction: 'credit',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.sourceId).toBeUndefined()
    expect(result.sourceType).toBeUndefined()
    expect(result.description).toBeUndefined()
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
