import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawPayPalReportingTransaction,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('paypal transformBalanceTransaction', () => {
  it('maps a charge event (T0001) to canonical type "charge"', () => {
    const raw: RawPayPalReportingTransaction = {
      transaction_id: 'PAY-001',
      transaction_event_code: 'T0001',
      transaction_status: 'S',
      transaction_amount: { currency_code: 'USD', value: '25.00' },
      fee_amount: { currency_code: 'USD', value: '-1.00' },
      transaction_initiation_date: '2024-01-15T10:00:00Z',
      paypal_account_id: 'acct_abc',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.fee).toBe(100)
    expect(result.net).toBe(2400)
    expect(result.gateway).toBe('paypal')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund event (T1101) to canonical type "refund"', () => {
    const raw: RawPayPalReportingTransaction = {
      transaction_id: 'REF-002',
      transaction_event_code: 'T1101',
      transaction_status: 'S',
      transaction_amount: { currency_code: 'EUR', value: '-10.50' },
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-1050)
    expect(result.currency).toBe('EUR')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a payout event (T0201) to canonical type "payout"', () => {
    const raw: RawPayPalReportingTransaction = {
      transaction_id: 'PYT-003',
      transaction_event_code: 'T0201',
      transaction_amount: { currency_code: 'GBP', value: '-100.00' },
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown event codes to "other"', () => {
    const raw: RawPayPalReportingTransaction = {
      transaction_id: 'UNK-004',
      transaction_event_code: 'T9999',
      transaction_amount: { currency_code: 'USD', value: '5.00' },
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('other')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
