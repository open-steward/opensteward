/**
 * Fixtures: the two rows of the List Payouts response example,
 * https://docs.rapyd.net/en/list-payouts.html (sender/beneficiary trimmed).
 */
import { describe, it, expect } from 'vitest'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/rapyd/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

const DOC_PAYOUT_EUR = {
  id: 'payout_f2a413634e3d60ce17f27010d77054a1',
  payout_type: 'bank',
  payout_method_type: 'at_sepa_bank',
  amount: 110,
  payout_currency: 'EUR',
  sender_amount: 110,
  sender_currency: 'EUR',
  status: 'Completed',
  sender_country: 'DK',
  beneficiary_country: 'AT',
  fx_rate: 1,
  metadata: {},
  description: 'Payout - Bank Transfer: Beneficiary/Sender objects',
  created_at: 1762784444,
  payout_fees: null,
  expiration: null,
  merchant_reference_id: '2025-11-10B',
  paid_at: '1762784490',
  error: null,
  paid_amount: 110,
  statement_descriptor: null,
}

const DOC_PAYOUT_SGD = {
  id: 'payout_d827bdb2750603fcdb76b12f9ab1bfc1',
  payout_type: 'bank',
  payout_method_type: 'sg_ocbc_bank',
  amount: 38000,
  payout_currency: 'SGD',
  sender_amount: 29108.09,
  sender_currency: 'USD',
  status: 'Completed',
}

describe('rapyd transformPayout', () => {
  it('maps the documented EUR payout and parses as a canonical Payout', () => {
    const r = PayoutSchema.parse(transformPayout(DOC_PAYOUT_EUR))
    expect(r.id).toBe('payout_f2a413634e3d60ce17f27010d77054a1')
    expect(r.externalId).toBe(r.id)
    expect(r.amount).toBe(11000)
    expect(r.currency).toBe('EUR')
    expect(r.status).toBe('paid')
    // paid_at is a numeric string in the documented example.
    expect(r.arrivalDate).toBe(new Date(1762784490 * 1000).toISOString())
    expect(r.createdAt).toBe(new Date(1762784444 * 1000).toISOString())
    expect(r.failureCode).toBeUndefined()
    expect(r.gateway).toBe('rapyd')
  })

  it('reads amount in payout_currency, not the sender side', () => {
    const r = PayoutSchema.parse(transformPayout(DOC_PAYOUT_SGD))
    expect(r.amount).toBe(3800000)
    expect(r.currency).toBe('SGD')
  })

  it.each([
    ['Completed', 'paid'],
    ['Created', 'pending'],
    ['Confirmation', 'pending'],
    ['Pending', 'pending'],
    ['Hold', 'pending'],
    ['Declined', 'failed'],
    ['Error', 'failed'],
    ['Returned', 'failed'],
    ['Canceled', 'cancelled'],
    ['Expired', 'cancelled'],
    ['Something', 'unknown'],
  ])('maps documented status %s to %s', (status, want) => {
    expect(PayoutSchema.parse(transformPayout({ ...DOC_PAYOUT_EUR, status })).status).toBe(want)
  })

  it('carries the documented error code', () => {
    const r = PayoutSchema.parse(
      transformPayout({ ...DOC_PAYOUT_EUR, status: 'Error', error: 'ERR_X' }),
    )
    expect(r.failureCode).toBe('ERR_X')
  })

  it('throws rather than defaulting a missing amount or currency', () => {
    expect(() => transformPayout({ ...DOC_PAYOUT_EUR, amount: undefined })).toThrow(/amount/)
    expect(() => transformPayout({ ...DOC_PAYOUT_EUR, payout_currency: undefined })).toThrow(
      /currency/,
    )
  })
})
