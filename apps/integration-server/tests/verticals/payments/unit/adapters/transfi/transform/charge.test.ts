/**
 * Fixtures are the documented examples: List Orders
 * (https://docs.transfi.com/reference/list-orders.md) and Get Order by ID
 * (https://docs.transfi.com/reference/get-order.md,
 * https://docs.transfi.com/docs/get-order-status-of-transfer-payin.md).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawTransfiOrder,
} from '../../../../../../../src/verticals/payments/adapters/transfi/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const SUCCESS_PAYIN: RawTransfiOrder = {
  id: 'OR-2604090808229261005',
  status: 'fund_settled',
  type: 'payin',
  source: { currency: 'USD', amount: '100' },
  destination: { currency: 'USD', amount: '79.7' },
  userId: 'UX-260409063251871699',
  senderName: { firstName: 'Test', lastName: 'User' },
  mid: 'TNA56H_TAT78L_NA',
}

const LIST_ROW: RawTransfiOrder = {
  id: 'OR-2603071056090301428',
  status: 'initiated',
  orderType: 'gaming',
  source: { currency: 'IDR', amount: '171729' },
  destination: { currency: 'USDC' },
  userId: 'UX-250910053447199',
  mid: 'SAH5F0_SHGASJ_NA',
  createdAt: '2026-03-07T10:56:21.899Z',
  updatedAt: '2026-03-07T10:56:21.899Z',
}

describe('transfi transformCharge', () => {
  it('maps a settled payin from source.amount / source.currency in minor units', () => {
    const c = ChargeSchema.parse(transformCharge(SUCCESS_PAYIN))
    expect(c.id).toBe('OR-2604090808229261005')
    expect(c.externalId).toBe('OR-2604090808229261005')
    expect(c.amount).toBe(10000)
    expect(c.currency).toBe('USD')
    expect(c.status).toBe('succeeded')
    expect(c.customerId).toBe('UX-260409063251871699')
    expect(c.gateway).toBe('transfi')
  })

  it('maps a list row with timestamps', () => {
    const c = ChargeSchema.parse(transformCharge(LIST_ROW))
    expect(c.amount).toBe(17172900)
    expect(c.currency).toBe('IDR')
    expect(c.status).toBe('pending')
    expect(c.createdAt).toBe('2026-03-07T10:56:21.899Z')
    expect(c.updatedAt).toBe('2026-03-07T10:56:21.899Z')
  })

  it('maps a failed order with failureCode / failureMessage and partnerContext', () => {
    const c = ChargeSchema.parse(
      transformCharge({
        id: 'OR-2604090713034795598',
        status: 'fund_failed',
        type: 'payin',
        source: { currency: 'AED', amount: '51' },
        destination: { currency: 'USDC', amount: '12.932634' },
        partnerContext: { testfield1: '1234', testfield3: 123 },
        failureCode: 'BEHAVIORAL_CHECK_FAILED',
        failureMessage: 'Biometric check of users device has failed.',
      }),
    )
    expect(c.status).toBe('failed')
    expect(c.amount).toBe(5100)
    expect(c.failureCode).toBe('BEHAVIORAL_CHECK_FAILED')
    expect(c.failureMessage).toBe('Biometric check of users device has failed.')
    expect(c.metadata).toEqual({ testfield1: '1234', testfield3: '123' })
  })

  it('refuses a three-letter crypto ticker (documented SOL payin) instead of scaling it as fiat', () => {
    // docs/webhook-events-payin.md Crypto Payin: "depositCurrency": "SOL", "sourceCurrencyType": "crypto"
    expect(() =>
      transformCharge({ ...SUCCESS_PAYIN, source: { currency: 'SOL', amount: '20' } }),
    ).toThrow(/not an ISO 4217/)
  })

  it('uses the currency exponent: 1000 JPY stays 1000', () => {
    const c = transformCharge({ ...SUCCESS_PAYIN, source: { currency: 'JPY', amount: '1000' } })
    expect(c.amount).toBe(1000)
  })

  it.each([
    ['manual_review', 'pending'],
    ['asset_settled', 'succeeded'],
    ['something_new', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(ChargeSchema.parse(transformCharge({ ...SUCCESS_PAYIN, status })).status).toBe(expected)
  })

  it('refuses a crypto source leg rather than inventing a currency', () => {
    expect(() =>
      transformCharge({ ...SUCCESS_PAYIN, source: { currency: 'USDT', amount: '100' } }),
    ).toThrow(/not an ISO 4217/)
  })

  it('refuses an order with no source amount rather than writing 0', () => {
    expect(() => transformCharge({ ...SUCCESS_PAYIN, source: { currency: 'USD' } })).toThrow(
      /source.amount/,
    )
  })

  it('refuses an order with no id', () => {
    expect(() => transformCharge({ ...SUCCESS_PAYIN, id: undefined })).toThrow(/no id/)
  })
})
