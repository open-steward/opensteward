/**
 * Instamojo payout -> canonical Payout.
 *
 * The fixture is the documented example row of MDP "List Payouts"
 * (https://docs.instamojo.com/v2-mdp/reference/payouts.md), GET
 * https://api.instamojo.com/v2/payouts/. The page documents `start_time` and
 * `end_time` as "paid out date-time", and gives no meaning for the boolean
 * `status`, so status is `unknown`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawInstamojoPayout,
} from '../../../../../../../src/verticals/payments/adapters/instamojo/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

/** The documented example row, verbatim. */
const DOC_PAYOUT: RawInstamojoPayout = {
  id: 'MOJO9413001M10071018',
  recipient: 'https://test.instamojo.com/v2/users/<value>/',
  status: true,
  paid_out_at: '2019-04-22T12:23:19.239722Z',
  currency: 'INR',
  paid_amount: '1570.75',
  sales_amount: '26983.21',
  fee_amount: '1744.92',
  total_tax_amount: '314.24',
  held_amount: '0.00',
  reversed_amount: '3965.00',
  refunded_amount: '0.00',
  affiliate_commission_amount: '0.00',
  partner_commission_amount: '0.00',
  payout_type: 0,
  resource_uri: 'https://test.instamojo.com/v2/payouts/<value>/',
  shipping_fee: '23386.42',
}

describe('instamojo transformPayout', () => {
  it('maps the documented List Payouts row and parses as a canonical Payout', () => {
    const out = PayoutSchema.parse(transformPayout(DOC_PAYOUT))
    expect(out.id).toBe('MOJO9413001M10071018')
    expect(out.externalId).toBe('MOJO9413001M10071018')
    // "paid_amount": "1570.75" INR is a major-unit decimal: 157075 paise.
    expect(out.amount).toBe(157075)
    expect(out.currency).toBe('INR')
    // The boolean status has no documented meaning for payouts.
    expect(out.status).toBe('unknown')
    expect(out.arrivalDate).toBe('2019-04-22T12:23:19.239Z')
    expect(out.createdAt).toBeUndefined()
    expect(out.gateway).toBe('instamojo')
    expect(out.metadata).toEqual({})
    expect(out.raw).toBe(DOC_PAYOUT)
  })

  it('omits arrivalDate when paid_out_at is absent', () => {
    const out = PayoutSchema.parse(transformPayout({ ...DOC_PAYOUT, paid_out_at: null }))
    expect(out.arrivalDate).toBeUndefined()
  })

  it('throws rather than inventing an amount or a currency', () => {
    expect(() =>
      transformPayout({ ...DOC_PAYOUT, paid_amount: undefined as unknown as string }),
    ).toThrow(/paid_amount/)
    expect(() =>
      transformPayout({ ...DOC_PAYOUT, currency: undefined as unknown as string }),
    ).toThrow(/currency/)
  })
})
