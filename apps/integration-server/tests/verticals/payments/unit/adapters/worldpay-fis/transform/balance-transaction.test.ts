import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawWorldpayStatementItem,
} from '../../../../../../../src/verticals/payments/adapters/worldpay-fis/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('worldpay-fis transformBalanceTransaction', () => {
  it('maps a credit PAYMENT statement item to canonical type "charge"', () => {
    const raw: RawWorldpayStatementItem = {
      statementItemId: 'stmt_001',
      transactionReference: 'ref_001',
      transferType: 'PAYMENT',
      amount: 12500,
      currency: 'USD',
      timestamp: '2026-01-15T09:30:00.000Z',
      fundingType: 'credit',
      description: 'Customer payment',
      statementNumber: 'SN-42',
      narrative: 'INV-001',
      countryCode: 'US',
      cleared: 'Y',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('stmt_001')
    expect(result.externalId).toBe('stmt_001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(12500)
    expect(result.currency).toBe('USD')
    expect(result.net).toBe(12500)
    expect(result.gateway).toBe('worldpay-fis')
    expect(result.sourceId).toBe('ref_001')
    expect(result.description).toBe('Customer payment')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('negates the amount for a DEBIT fundingType', () => {
    const raw: RawWorldpayStatementItem = {
      statementItemId: 'stmt_002',
      transferType: 'PAYOUT',
      amount: 5000,
      currency: 'GBP',
      fundingType: 'debit',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.amount).toBe(-5000)
    expect(result.net).toBe(-5000)
    expect(result.type).toBe('payout')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a REFUND transferType to canonical type "refund"', () => {
    const raw: RawWorldpayStatementItem = {
      statementItemId: 'stmt_003',
      transferType: 'REFUND',
      amount: 999,
      currency: 'EUR',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.currency).toBe('EUR')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a CHARGEBACK transferType to canonical type "dispute"', () => {
    const raw: RawWorldpayStatementItem = {
      transferType: 'CHARGEBACK',
      amount: 750,
      currency: 'USD',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('dispute')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown transferType to "other" and falls back to GBP when no currency', () => {
    const raw: RawWorldpayStatementItem = {
      statementItemId: 'stmt_004',
      transferType: 'UNKNOWN_THING',
      amount: 100,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('other')
    expect(result.currency).toBe('GBP')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('uses narrative as description when description is absent', () => {
    const raw: RawWorldpayStatementItem = {
      statementItemId: 'stmt_005',
      transferType: 'FEE',
      amount: 50,
      currency: 'USD',
      narrative: 'Monthly fee',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.description).toBe('Monthly fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
