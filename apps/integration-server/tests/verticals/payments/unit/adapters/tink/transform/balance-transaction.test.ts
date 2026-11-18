import { describe, it, expect } from 'vitest'
import { transformBalanceTransaction } from '../../../../../../../src/verticals/payments/adapters/tink/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'
import { TRANSACTION } from '../fixtures'

describe('tink transformBalanceTransaction (documented SettlementAccountTransaction)', () => {
  it('maps the documented example transaction', () => {
    const b = BalanceTransactionSchema.parse(transformBalanceTransaction(TRANSACTION))
    expect(b.id).toBe(TRANSACTION.id)
    expect(b.externalId).toBe(b.id)
    expect(b.type).toBe('charge')
    expect(b.amount).toBe(12300)
    expect(b.currency).toBe('GBP')
    expect(b.sourceId).toBe(TRANSACTION.id)
    expect(b.sourceType).toBe('charge')
    expect(b.description).toBe('Wdr7ad0feabb4ab')
    expect(b.createdAt).toBe('2021-07-14T14:01:53.000Z')
    expect(b.metadata).toEqual({ key1: 'value1', key2: 'value2' })
    expect(b.gateway).toBe('tink')
    expect(b.fee).toBeUndefined()
    expect(b.net).toBeUndefined()
    expect(b.availableOn).toBeUndefined()
  })

  it.each([
    ['PAYIN', 'charge', 'charge'],
    ['SWEEP', 'payout', 'payout'],
    ['REFUND', 'refund', undefined],
    ['TRANSFER', 'transfer', undefined],
    ['REVERT', 'adjustment', undefined],
    ['PAYMENT_REVERSAL', 'adjustment', undefined],
    ['MERCHANT_PAYIN', 'adjustment', undefined],
    ['WITHDRAWAL', 'other', undefined],
    ['EXTERNAL_PAYIN', 'other', undefined],
    ['TRANSACTION_TYPE_UNSPECIFIED', 'other', undefined],
  ])('maps SettlementAccountTransactionType %s to %s', (type, want, sourceType) => {
    const b = BalanceTransactionSchema.parse(transformBalanceTransaction({ ...TRANSACTION, type }))
    expect(b.type).toBe(want)
    expect(b.sourceType).toBe(sourceType)
    expect(b.sourceId).toBe(sourceType ? TRANSACTION.id : undefined)
  })

  it('throws rather than defaulting a currency', () => {
    expect(() =>
      transformBalanceTransaction({
        ...TRANSACTION,
        amount: { value: TRANSACTION.amount.value },
      } as never),
    ).toThrow(/currencyCode/)
  })
})
