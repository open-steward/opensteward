/**
 * Fixture: the documented disbursement webhook/query payload
 * (https://docs.stitch.money/payment-products/payouts/disbursements).
 */
import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawStitchDisbursement,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

const DOC_EXAMPLE: RawStitchDisbursement = {
  amount: { currency: 'ZAR', quantity: '1' },
  beneficiaryReference: 'example-ref',
  created: '2022-10-06T15:03:08.436Z',
  id: 'ZGlzYnVyc2VtZW50Lzc2YTlhMjIwLWVjMGItNDJmOS04NGMzLTcyOGU4MjQ4MWVlNQ==',
  linkedAccountId: null,
  nonce: 'bc70425a-9fa3-4db7-8e8b-93edb0b2aa23',
  status: {
    __typename: 'DisbursementCompleted',
    date: '2022-10-06T15:03:08.694Z',
    expectedSettlement: '2022-10-08T15:03:08.694Z',
  },
}

describe('stitch transformPayout (Disbursement)', () => {
  it('maps the documented example and parses as a canonical Payout', () => {
    const p = PayoutSchema.parse(transformPayout(DOC_EXAMPLE))
    expect(p.id).toBe(DOC_EXAMPLE.id)
    expect(p.externalId).toBe(DOC_EXAMPLE.id)
    expect(p.amount).toBe(100)
    expect(p.currency).toBe('ZAR')
    expect(p.status).toBe('paid')
    expect(p.arrivalDate).toBe('2022-10-08T15:03:08.694Z')
    expect(p.statementDescriptor).toBe('example-ref')
    expect(p.createdAt).toBe('2022-10-06T15:03:08.436Z')
    expect(p.gateway).toBe('stitch')
  })

  it.each([
    ['DisbursementPending', 'pending'],
    ['DisbursementPaused', 'pending'],
    ['DisbursementSubmitted', 'in_transit'],
    ['DisbursementCompleted', 'paid'],
    ['DisbursementError', 'failed'],
    ['DisbursementReversed', 'failed'],
    ['DisbursementCancelled', 'cancelled'],
    ['SomethingNew', 'unknown'],
  ])('maps status %s to %s', (typename, status) => {
    const p = PayoutSchema.parse(
      transformPayout({ ...DOC_EXAMPLE, status: { __typename: typename } }),
    )
    expect(p.status).toBe(status)
  })

  it('carries the documented error reason and description', () => {
    const p = PayoutSchema.parse(
      transformPayout({
        ...DOC_EXAMPLE,
        status: {
          __typename: 'DisbursementError',
          date: '2022-10-06T15:03:08.694Z',
          disbursementErrorReason: 'inactive_account',
          disbursementErrorDescription: 'The account is inactive.',
        },
      }),
    )
    expect(p.failureCode).toBe('inactive_account')
    expect(p.failureMessage).toBe('The account is inactive.')
    expect(p.arrivalDate).toBeUndefined()
  })

  it('carries the documented reversal reason and description', () => {
    const p = PayoutSchema.parse(
      transformPayout({
        ...DOC_EXAMPLE,
        status: {
          __typename: 'DisbursementReversed',
          date: '2022-10-06T15:03:08.694Z',
          disbursementReversedReason: 'account_closed',
          disbursementReversedDescription: 'The account was closed.',
        },
      }),
    )
    expect(p.status).toBe('failed')
    expect(p.failureCode).toBe('account_closed')
    expect(p.failureMessage).toBe('The account was closed.')
  })

  it('converts a decimal quantity to minor units', () => {
    const p = PayoutSchema.parse(
      transformPayout({ ...DOC_EXAMPLE, amount: { currency: 'ZAR', quantity: '395.75' } }),
    )
    expect(p.amount).toBe(39575)
  })

  it('throws rather than inventing an amount or currency', () => {
    expect(() =>
      transformPayout({ ...DOC_EXAMPLE, amount: { quantity: 'x', currency: 'ZAR' } }),
    ).toThrow(/amount/)
    expect(() => transformPayout({ ...DOC_EXAMPLE, amount: null as never })).toThrow(/amount/)
  })
})
