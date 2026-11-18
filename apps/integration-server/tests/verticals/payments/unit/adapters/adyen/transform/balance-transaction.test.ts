import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawAdyenBalanceTxn,
} from '../../../../../../../src/verticals/payments/adapters/adyen/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('adyen transformBalanceTransaction', () => {
  it('maps a payment type to "charge" and preserves amount + currency', () => {
    const raw: RawAdyenBalanceTxn = {
      id: 'BAL-001',
      type: 'payment',
      amount: { value: 3000, currency: 'usd' },
      status: 'settled',
      creationDate: '2024-03-01T00:00:00Z',
      bookingDate: '2024-03-02T00:00:00Z',
      reference: 'REF-001',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('BAL-001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(3000)
    expect(result.currency).toBe('USD')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.availableOn).toBe('2024-03-02T00:00:00Z')
    expect(result.gateway).toBe('adyen')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund type to "refund"', () => {
    const raw: RawAdyenBalanceTxn = {
      id: 'BAL-002',
      type: 'refund',
      amount: { value: 1000, currency: 'eur' },
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a chargeback type to "dispute"', () => {
    const raw: RawAdyenBalanceTxn = {
      id: 'BAL-003',
      type: 'chargeback',
      amount: { value: 2500, currency: 'gbp' },
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('dispute')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown type to "other"', () => {
    const raw: RawAdyenBalanceTxn = {
      id: 'BAL-004',
      type: 'miscellaneous',
      amount: { value: 500, currency: 'usd' },
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('other')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
