import { describe, it, expect } from 'vitest'
import { transformPayoutEntry } from '../../../../../../../src/verticals/payments/adapters/yoco/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'
import { PAYOUT_ENTRY } from '../fixtures'

describe('yoco transformPayoutEntry (documented PayoutEntry)', () => {
  it('maps the documented example payout entry', () => {
    const t = BalanceTransactionSchema.parse(transformPayoutEntry(PAYOUT_ENTRY))
    expect(t.id).toBe('1744289052-a70682ae-7376-404c-9859-3aa100322fa0')
    expect(t.type).toBe('charge')
    expect(t.amount).toBe(12000)
    expect(t.currency).toBe('ZAR')
    expect(t.fee).toBe(350)
    expect(t.net).toBe(11400)
    expect(t.sourceId).toBe('1744288539-57db0a32-3cae-40af-a328-b22a09cfcb94')
    expect(t.sourceType).toBe('payout')
    expect(t.createdAt).toBeUndefined()
    expect(t.metadata).toEqual({ client_transaction_id: 'rfd_765fde5ded7bxd', type: 'payment' })
  })

  it.each([
    ['payment', 'charge'],
    ['refund', 'refund'],
    ['instant_payout', 'payout'],
    ['fee', 'fee'],
    ['dispute', 'dispute'],
    ['adjustment', 'adjustment'],
    ['rebate', 'adjustment'],
    ['loyalty', 'adjustment'],
    ['capital', 'other'],
    ['brand-new', 'unknown'],
  ])('maps PayoutEntryType %s to %s', (type, want) => {
    expect(
      BalanceTransactionSchema.parse(transformPayoutEntry({ ...PAYOUT_ENTRY, type })).type,
    ).toBe(want)
  })

  it('throws rather than inventing an amount when gross_amount is missing', () => {
    const { gross_amount: _drop, ...rest } = PAYOUT_ENTRY
    expect(() => transformPayoutEntry(rest as typeof PAYOUT_ENTRY)).toThrow(/gross_amount/)
  })
})
