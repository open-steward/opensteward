/**
 * Which Moov transfer rails are charges and which are payouts (adapters/moov/rails.ts).
 *
 * Rail names are the `paymentMethodType` enum documented on
 * https://docs.moov.io/api/money-movement/transfers/list/: "moov-wallet,
 * ach-debit-fund, ach-debit-collect, ach-credit-standard, ach-credit-same-day,
 * rtp-credit, card-payment, push-to-card, pull-from-card, apple-pay,
 * card-present-payment, instant-bank-credit, push-to-apple-pay,
 * pull-from-apple-pay, google-pay, push-to-google-pay, pull-from-google-pay".
 */
import { describe, expect, it } from 'vitest'
import { isCharge, isPayout } from '../../../../../../src/verticals/payments/adapters/moov/rails'

const ALL_RAILS = [
  'moov-wallet',
  'ach-debit-fund',
  'ach-debit-collect',
  'ach-credit-standard',
  'ach-credit-same-day',
  'rtp-credit',
  'card-payment',
  'push-to-card',
  'pull-from-card',
  'apple-pay',
  'card-present-payment',
  'instant-bank-credit',
  'push-to-apple-pay',
  'pull-from-apple-pay',
  'google-pay',
  'push-to-google-pay',
  'pull-from-google-pay',
]

const CHARGE_SOURCES = ['card-payment', 'apple-pay', 'google-pay', 'ach-debit-collect']
const PAYOUT_DESTINATIONS = [
  'ach-credit-standard',
  'ach-credit-same-day',
  'instant-bank-credit',
  'rtp-credit',
  'push-to-card',
  'push-to-apple-pay',
  'push-to-google-pay',
]

describe('Moov rail classification', () => {
  it.each(ALL_RAILS)('source rail %s is a charge only if it collects from a payer', (rail) => {
    expect(isCharge({ source: { paymentMethodType: rail } })).toBe(CHARGE_SOURCES.includes(rail))
  })

  it.each(ALL_RAILS)('destination rail %s is a payout only if it pays a recipient', (rail) => {
    expect(isPayout({ destination: { paymentMethodType: rail } })).toBe(
      PAYOUT_DESTINATIONS.includes(rail),
    )
  })

  it('reads the charge rail from the source and the payout rail from the destination', () => {
    expect(isCharge({ destination: { paymentMethodType: 'card-payment' } })).toBe(false)
    expect(isPayout({ source: { paymentMethodType: 'push-to-card' } })).toBe(false)
    expect(isCharge({})).toBe(false)
    expect(isPayout({})).toBe(false)
  })
})
