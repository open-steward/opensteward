import { describe, it, expect } from 'vitest'
import { transformBalanceTransaction } from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

// ChargeTransaction.yaml etc.: id "btxn_0YVCNJYRXTDDQ9QF2Z60ZA05WP", transactionId,
// settlementAmount (number | null), settlementCurrency, settlementTime.
const base = {
  id: 'btxn_0YVCNJYRXTDDQ9QF2Z60ZA05WP',
  type: 'charge',
  parentId: null,
  transactionId: 'txn_0YVDTQJ8YWDGQACV2N2N5SPWQ0',
  settlementAmount: 97.1,
  settlementCurrency: 'USD',
  settlementTime: '2026-01-20T00:00:00Z',
  createdTime: '2026-01-15T00:00:00Z',
}

describe('rebilly transformBalanceTransaction', () => {
  it('maps the documented fields', () => {
    expect(BalanceTransactionSchema.parse(transformBalanceTransaction(base))).toMatchObject({
      type: 'charge',
      amount: 9710,
      currency: 'USD',
      sourceId: 'txn_0YVDTQJ8YWDGQACV2N2N5SPWQ0',
      sourceType: 'charge',
      availableOn: '2026-01-20T00:00:00Z',
    })
  })

  it.each([
    ['refund', 'refund'],
    ['buy-fee', 'fee'],
    ['sell-fee', 'fee'],
    ['risk-reserve', 'other'],
    ['reverse', 'other'],
  ])('maps %s to %s', (raw, type) => {
    expect(
      BalanceTransactionSchema.parse(transformBalanceTransaction({ ...base, type: raw })).type,
    ).toBe(type)
  })

  it('throws on a null settlementAmount rather than inventing one', () => {
    expect(() => transformBalanceTransaction({ ...base, settlementAmount: null })).toThrow(/amount/)
  })
})
