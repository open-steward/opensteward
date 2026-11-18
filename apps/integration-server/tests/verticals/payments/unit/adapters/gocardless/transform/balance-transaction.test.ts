import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawGCPayoutItem,
} from '../../../../../../../src/verticals/payments/adapters/gocardless/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('gocardless transformBalanceTransaction', () => {
  it('maps a payment_paid_out item to type "charge"', () => {
    const raw: RawGCPayoutItem = {
      id: 'pyitem_001',
      amount: '5000',
      type: 'payment_paid_out',
      links: { payment: 'PM001', payout: 'PO001' },
    }
    const result = transformBalanceTransaction(raw, 'gbp')
    expect(result.id).toBe('pyitem_001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('GBP')
    expect(result.sourceId).toBe('PM001')
    expect(result.gateway).toBe('gocardless')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a payment_refunded item to type "refund"', () => {
    const raw: RawGCPayoutItem = {
      id: 'pyitem_002',
      amount: '1000',
      type: 'payment_refunded',
      links: { refund: 'RF001' },
    }
    const result = transformBalanceTransaction(raw, 'eur')
    expect(result.type).toBe('refund')
    expect(result.currency).toBe('EUR')
    expect(result.sourceId).toBe('RF001')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a gocardless_fee item to type "fee"', () => {
    const raw: RawGCPayoutItem = {
      id: 'pyitem_003',
      amount: '25',
      type: 'gocardless_fee',
    }
    const result = transformBalanceTransaction(raw, 'gbp')
    expect(result.type).toBe('fee')
    expect(result.amount).toBe(25)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a chargeback item to type "dispute"', () => {
    const raw: RawGCPayoutItem = {
      id: 'pyitem_004',
      amount: '2000',
      type: 'chargeback',
      links: { payment: 'PM002' },
    }
    const result = transformBalanceTransaction(raw, 'usd')
    expect(result.type).toBe('dispute')
    expect(result.currency).toBe('USD')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('falls back to "other" for an unknown type', () => {
    const raw: RawGCPayoutItem = {
      id: 'pyitem_005',
      amount: '100',
      type: 'unknown_type',
    }
    const result = transformBalanceTransaction(raw, 'gbp')
    expect(result.type).toBe('other')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
