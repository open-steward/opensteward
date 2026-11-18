import { describe, it, expect } from 'vitest'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/sumup/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'
import { PAYOUT_ROW } from '../fixtures'

describe('sumup transformPayout', () => {
  it('maps the documented FinancialPayout example, amounts from major to minor units', () => {
    const p = PayoutSchema.parse(transformPayout(PAYOUT_ROW))
    expect(p.id).toBe('123456789')
    expect(p.externalId).toBe('123456789')
    expect(p.amount).toBe(13245)
    expect(p.currency).toBe('EUR')
    expect(p.status).toBe('paid')
    expect(p.metadata).toEqual({
      type: 'PAYOUT',
      date: '2024-02-29',
      reference: 'payout-2024-02-29',
      transactionCode: 'TEENSK4W2K',
      feeMinor: '312',
    })
    expect(p.gateway).toBe('sumup')
  })

  it('maps FAILED to failed', () => {
    expect(PayoutSchema.parse(transformPayout({ ...PAYOUT_ROW, status: 'FAILED' })).status).toBe(
      'failed',
    )
  })

  it('throws rather than inventing a missing currency or amount', () => {
    expect(() => transformPayout({ ...PAYOUT_ROW, currency: '' })).toThrow(/currency/)
    expect(() =>
      transformPayout({ ...PAYOUT_ROW, amount: undefined as unknown as number }),
    ).toThrow(/amount/)
  })
})
