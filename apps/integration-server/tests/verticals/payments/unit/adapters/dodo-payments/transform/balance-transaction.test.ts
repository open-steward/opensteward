import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawDodoLedgerEntry,
} from '../../../../../../../src/verticals/payments/adapters/dodo-payments/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('dodo-payments transformBalanceTransaction', () => {
  it('maps a payment credit entry with positive signed amount', () => {
    const raw: RawDodoLedgerEntry = {
      id: 'ledger_abc123',
      business_id: 'biz_001',
      event_type: 'payment_succeeded',
      amount: 5000,
      currency: 'usd',
      is_credit: true,
      created_at: '2024-03-01T00:00:00Z',
      usd_equivalent_amount: 5000,
      after_balance: 15000,
      before_balance: 10000,
      description: 'Payment received',
      reference_object_id: 'pay_xyz',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('ledger_abc123')
    expect(result.externalId).toBe('ledger_abc123')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(5000)
    expect(result.net).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('dodo-payments')
    expect(result.sourceId).toBe('pay_xyz')
    expect(result.sourceType).toBe('payment_succeeded')
    expect(result.description).toBe('Payment received')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('negates amount for a debit entry (is_credit=false)', () => {
    const raw: RawDodoLedgerEntry = {
      id: 'ledger_debit',
      event_type: 'payout_sent',
      amount: 2000,
      currency: 'USD',
      is_credit: false,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.amount).toBe(-2000)
    expect(result.net).toBe(-2000)
    expect(result.type).toBe('payout')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund event_type to type "refund"', () => {
    const raw: RawDodoLedgerEntry = {
      id: 'ledger_ref',
      event_type: 'refund_issued',
      amount: 1000,
      currency: 'USD',
      is_credit: false,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a dispute event to type "dispute"', () => {
    const raw: RawDodoLedgerEntry = {
      id: 'ledger_dispute',
      // "dispute" keyword matches before "charge" in mapType
      event_type: 'dispute_deduction',
      amount: 3000,
      currency: 'USD',
      is_credit: false,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('dispute')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown event_type to "other"', () => {
    const raw: RawDodoLedgerEntry = {
      id: 'ledger_unk',
      event_type: 'something_else',
      amount: 0,
      currency: 'USD',
      is_credit: true,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('other')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
