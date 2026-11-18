import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawXenditTransaction,
} from '../../../../../../../src/verticals/payments/adapters/xendit/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('xendit transformBalanceTransaction', () => {
  it('maps a PAYMENT transaction to type "charge" and computes amount from net + fee', () => {
    const raw: RawXenditTransaction = {
      id: 'txn-001',
      reference_id: 'ref-001',
      type: 'PAYMENT',
      status: 'SUCCESS',
      channel_code: 'BCA',
      net_amount: 95000,
      fee: 5000,
      currency: 'IDR',
      business_id: 'biz-1',
      created: '2024-03-01T00:00:00Z',
      updated: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(100000)
    expect(result.net).toBe(95000)
    expect(result.fee).toBe(5000)
    expect(result.currency).toBe('IDR')
    expect(result.gateway).toBe('xendit')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a REFUND transaction to type "refund" and defaults currency to IDR when absent', () => {
    const raw: RawXenditTransaction = {
      id: 'txn-002',
      type: 'REFUND',
      net_amount: 50000,
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.currency).toBe('IDR')
    expect(result.net).toBe(50000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a DISBURSEMENT transaction to type "payout"', () => {
    const raw: RawXenditTransaction = {
      id: 'txn-003',
      type: 'DISBURSEMENT',
      net_amount: 200000,
      currency: 'PHP',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(result.currency).toBe('PHP')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown type to "other"', () => {
    const raw: RawXenditTransaction = {
      id: 'txn-004',
      type: 'UNKNOWN_OP',
      net_amount: 1000,
      currency: 'USD',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('other')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
