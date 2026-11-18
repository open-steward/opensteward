/**
 * Moov transfer → canonical Payout.
 *
 * Fixtures are built from the fields "List transfers" documents
 * (https://docs.moov.io/api/money-movement/transfers/list/); see ../fixtures.ts.
 * Rail speeds (https://docs.moov.io/guides/money-movement/payment-methods/):
 * "ach-credit-standard | Bank account | Credit a bank account (1-2 business days)",
 * "push-to-card | Debit/prepaid card | Instant credit to a debit card",
 * "instant-bank-credit | Bank account | Real-time credit via RTP".
 */
import { describe, it, expect } from 'vitest'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/moov/transform/payout'
import { ACH_PAYOUT_TRANSFER, PUSH_TO_CARD_PAYOUT } from '../fixtures'

describe('transformPayout (Moov transfer)', () => {
  it('maps a wallet → bank ACH payout to a schema-valid payout', () => {
    const payout = PayoutSchema.parse(transformPayout(ACH_PAYOUT_TRANSFER as never))
    expect(payout).toEqual({
      id: 'c0ffee00-0000-4000-8000-000000000002',
      externalId: 'c0ffee00-0000-4000-8000-000000000002',
      amount: 50000,
      currency: 'USD',
      status: 'paid',
      method: 'standard',
      destinationLast4: '6789',
      gateway: 'moov',
      metadata: { batch: 'wk5' },
      createdAt: '2025-02-01T12:00:00Z',
      raw: ACH_PAYOUT_TRANSFER,
    })
  })

  it('maps a failed push-to-card payout: instant, card last four, failure reason', () => {
    const payout = PayoutSchema.parse(transformPayout(PUSH_TO_CARD_PAYOUT as never))
    expect(payout.method).toBe('instant')
    expect(payout.destinationLast4).toBe('4242')
    expect(payout.status).toBe('failed')
    expect(payout.failureCode).toBe('destination-payment-error')
  })

  it('leaves the method unset for same-day ACH, which is neither standard nor instant', () => {
    const payout = transformPayout({
      ...ACH_PAYOUT_TRANSFER,
      destination: { ...ACH_PAYOUT_TRANSFER.destination, paymentMethodType: 'ach-credit-same-day' },
    } as never)
    expect(payout.method).toBeUndefined()
    expect(payout.destinationLast4).toBe('6789')
  })

  it.each([
    ['created', 'pending'],
    ['queued', 'pending'],
    ['pending', 'pending'],
    ['completed', 'paid'],
    ['failed', 'failed'],
    ['canceled', 'cancelled'],
    ['reversed', 'unknown'],
  ])('maps transfer status %s to %s', (moov, canonical) => {
    const payout = transformPayout({ ...ACH_PAYOUT_TRANSFER, status: moov } as never)
    expect(PayoutSchema.parse(payout).status).toBe(canonical)
  })

  it('refuses a transfer with no amount value rather than reporting zero', () => {
    expect(() =>
      transformPayout({ ...ACH_PAYOUT_TRANSFER, amount: { currency: 'USD' } } as never),
    ).toThrow(/amount/)
  })
})

describe('transformPayout rails', () => {
  it.each([
    ['ach-credit-standard', 'standard'],
    ['ach-credit-same-day', undefined],
    ['instant-bank-credit', 'instant'],
    ['rtp-credit', 'instant'],
    ['push-to-card', 'instant'],
    ['push-to-apple-pay', 'instant'],
    ['push-to-google-pay', 'instant'],
  ])('maps destination rail %s to method %s', (rail, method) => {
    const payout = transformPayout({
      ...ACH_PAYOUT_TRANSFER,
      destination: { ...ACH_PAYOUT_TRANSFER.destination, paymentMethodType: rail },
    } as never)
    expect(PayoutSchema.parse(payout).method).toBe(method)
  })

  it.each(['ach-credit-standard', 'ach-credit-same-day', 'instant-bank-credit', 'rtp-credit'])(
    'reads the bank account last four on the %s rail',
    (rail) => {
      const payout = transformPayout({
        ...ACH_PAYOUT_TRANSFER,
        destination: { ...ACH_PAYOUT_TRANSFER.destination, paymentMethodType: rail },
      } as never)
      expect(payout.destinationLast4).toBe('6789')
    },
  )

  it('refuses a transfer without a transferID', () => {
    expect(() =>
      transformPayout({ ...ACH_PAYOUT_TRANSFER, transferID: undefined } as never),
    ).toThrow(/transferID/)
  })
})
