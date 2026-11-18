/**
 * Fixtures from https://docs.transfi.com/docs/get-order-status-of-transfer-payout.md
 * ("Fiat-Payout order" and "Crypto Payout order").
 */
import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawTransfiPayout,
} from '../../../../../../../src/verticals/payments/adapters/transfi/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

const FIAT_PAYOUT: RawTransfiPayout = {
  id: 'OR-2509301734555691983',
  status: 'fund_processing',
  type: 'payout',
  purposeCode: 'personal',
  source: { currency: 'USDT', amount: '12.481217', paymentType: 'bank_transfer' },
  destination: { currency: 'EUR', amount: '10' },
  userId: 'UX-250910053447199',
  mid: 'ABCDEF_NA_NA',
}

describe('transfi transformPayout', () => {
  it('maps the documented fiat payout from destination.amount / destination.currency', () => {
    const p = PayoutSchema.parse(transformPayout(FIAT_PAYOUT))
    expect(p.id).toBe('OR-2509301734555691983')
    expect(p.externalId).toBe('OR-2509301734555691983')
    expect(p.amount).toBe(1000)
    expect(p.currency).toBe('EUR')
    expect(p.status).toBe('in_transit')
    expect(p.gateway).toBe('transfi')
  })

  it('carries failureCode / failureMessage / createdAt (Get Order schema fields; values from the payout "Fund Failed" webhook example)', () => {
    const p = PayoutSchema.parse(
      transformPayout({
        ...FIAT_PAYOUT,
        status: 'fund_failed',
        failureCode: 'INVALID_ACCOUNT_DETAILS',
        failureMessage: 'Invalid account details provided. Please check and try again.',
        createdAt: '2026-08-24T09:47:00.552Z',
      }),
    )
    expect(p.status).toBe('failed')
    expect(p.failureCode).toBe('INVALID_ACCOUNT_DETAILS')
    expect(p.failureMessage).toBe('Invalid account details provided. Please check and try again.')
    expect(p.createdAt).toBe('2026-08-24T09:47:00.552Z')
  })

  it.each([
    ['initiated', 'pending'],
    ['fund_scheduled', 'in_transit'],
    ['fund_settled', 'paid'],
    ['asset_deposited', 'paid'],
    ['fund_failed', 'failed'],
    ['fund_deposit_failed', 'failed'],
    ['something_new', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(PayoutSchema.parse(transformPayout({ ...FIAT_PAYOUT, status })).status).toBe(expected)
  })

  it('refuses the documented crypto payout (USDTPOLYGON) rather than inventing a currency', () => {
    expect(() =>
      transformPayout({
        ...FIAT_PAYOUT,
        destination: { currency: 'USDTPOLYGON', amount: '100', walletAddress: '0xDEAD' },
      }),
    ).toThrow(/not an ISO 4217/)
  })

  it('refuses a payout with no destination amount rather than writing 0', () => {
    expect(() => transformPayout({ ...FIAT_PAYOUT, destination: { currency: 'EUR' } })).toThrow(
      /destination.amount/,
    )
  })
})
