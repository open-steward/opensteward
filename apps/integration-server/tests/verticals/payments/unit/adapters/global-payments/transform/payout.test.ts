import { describe, it, expect } from 'vitest'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/global-payments/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'
import { DEPOSIT } from '../fixtures/documented'

describe('global-payments transformPayout (GP-API settlement deposit)', () => {
  it('maps the documented deposit', () => {
    const payout = PayoutSchema.parse(transformPayout(DEPOSIT))
    expect(payout.id).toBe('DEP_2342423423')
    expect(payout.externalId).toBe('DEP_2342423423')
    expect(payout.amount).toBe(500)
    expect(payout.currency).toBe('USD')
    expect(payout.status).toBe('paid')
    expect(payout.gateway).toBe('global-payments')
    // A date with no time or zone is not turned into an instant.
    expect(payout.createdAt).toBeUndefined()
    expect(payout.destinationLast4).toBeUndefined()
    expect(payout.metadata).toEqual({
      settlement_date: '2021-05-03',
      funding_type: 'DEBIT',
      aggregation_model: '4-No Summary',
    })
  })

  it('reads the bank account last 4', () => {
    const payout = PayoutSchema.parse(
      transformPayout({ ...DEPOSIT, bank_transfer: { masked_account_number_last4: '1234' } }),
    )
    expect(payout.destinationLast4).toBe('1234')
  })

  it.each([
    ['FUNDED', 'paid'],
    ['RESERVED', 'pending'],
    ['RESERVED ', 'pending'],
    ['DELAYED', 'pending'],
    ['IRREG', 'unknown'],
    ['RELEASED', 'unknown'],
  ])('maps status %j to %s', (status, expected) => {
    expect(PayoutSchema.parse(transformPayout({ ...DEPOSIT, status })).status).toBe(expected)
  })

  it('throws rather than inventing an amount or a currency', () => {
    const { amount: _a, ...noAmount } = DEPOSIT
    const { currency: _c, ...noCurrency } = DEPOSIT
    expect(() => transformPayout(noAmount)).toThrow(/amount/)
    expect(() => transformPayout(noCurrency)).toThrow(/currency/)
  })
})
