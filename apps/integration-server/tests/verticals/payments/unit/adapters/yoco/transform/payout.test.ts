import { describe, it, expect } from 'vitest'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/yoco/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'
import { PAYOUT } from '../fixtures'

describe('yoco transformPayout (documented Payout)', () => {
  it('maps the documented example payout, amount from net_amount', () => {
    const p = PayoutSchema.parse(transformPayout(PAYOUT))
    expect(p.id).toBe('1744288539-57db0a32-3cae-40af-a328-b22a09cfcb94')
    expect(p.amount).toBe(11400)
    expect(p.currency).toBe('ZAR')
    expect(p.status).toBe('paid')
    expect(p.method).toBe('standard')
    expect(p.arrivalDate).toBeUndefined()
    expect(p.createdAt).toBe('2024-11-19T15:27:02+00:00')
    expect(p.updatedAt).toBe('2024-11-19T16:27:23+00:00')
  })

  it.each([
    ['sent', 'in_transit'],
    ['paid', 'paid'],
    ['failed', 'failed'],
    ['unpaid', 'failed'],
    ['new', 'unknown'],
  ])('maps PayoutStatus %s to %s', (status, want) => {
    expect(PayoutSchema.parse(transformPayout({ ...PAYOUT, status })).status).toBe(want)
  })

  it.each([
    ['instant', 'instant'],
    ['standard', 'standard'],
    ['fast', 'unknown'],
    ['weekly', 'unknown'],
  ])('maps PayoutType %s to %s', (payout_type, want) => {
    expect(PayoutSchema.parse(transformPayout({ ...PAYOUT, payout_type })).method).toBe(want)
  })

  it('throws rather than inventing an amount when net_amount is missing', () => {
    const { net_amount: _drop, ...rest } = PAYOUT
    expect(() => transformPayout(rest as typeof PAYOUT)).toThrow(/net_amount/)
  })
})
