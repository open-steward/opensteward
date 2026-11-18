import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawTrustlyLedgerRow,
} from '../../../../../../../src/verticals/payments/adapters/trustly/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('trustly transformBalanceTransaction', () => {
  it('maps a deposit ledger row to a charge type', () => {
    const raw: RawTrustlyLedgerRow = {
      orderid: 'ORDER_001',
      gluepayid: 'GLUE_001',
      transactiontype: 'deposit',
      amount: '50.00',
      currency: 'EUR',
      datestamp: '2024-03-01T00:00:00Z',
      accountname: 'merchant_account',
      userid: 'user_001',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('ORDER_001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('trustly')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund ledger row to a refund type', () => {
    const raw: RawTrustlyLedgerRow = {
      orderid: 'ORDER_002',
      transactiontype: 'refund',
      amount: '25.00',
      currency: 'SEK',
      datestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('SEK')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a fee ledger row to a fee type', () => {
    const raw: RawTrustlyLedgerRow = {
      orderid: 'ORDER_003',
      transactiontype: 'transaction_fee',
      amount: '0.50',
      currency: 'EUR',
      datestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a chargeback to dispute type', () => {
    const raw: RawTrustlyLedgerRow = {
      orderid: 'ORDER_004',
      transactiontype: 'chargeback',
      amount: '100.00',
      currency: 'USD',
      datestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('dispute')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
