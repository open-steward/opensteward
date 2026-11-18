/**
 * Fixture: the payment in the "Retrieve a payment" / "List all Payments in
 * Batch" example responses (https://developers.trolley.com/api/), trimmed of
 * the nested recipient profile the transform reads only the id of.
 */
import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawTrolleyPayout,
} from '../../../../../../../src/verticals/payments/adapters/trolley/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

const DOC_PAYMENT: RawTrolleyPayout = {
  id: 'P-1a2B3c4D5e6F7g8H9i0J1k',
  recipient: { id: 'R-1a2B3c4D5e6F7g8H9i0J1k', email: 'jsmith11@example.com' },
  status: 'processed',
  sourceAmount: '100.10',
  exchangeRate: '1.0000',
  fees: '1.25',
  recipientFees: '1.25',
  targetAmount: '98.85',
  fxRate: '2.000000',
  memo: 'memo',
  processedAt: '2017-03-28T04:09:02.955Z',
  createdAt: '2017-03-21T20:56:43.714Z',
  updatedAt: '2017-03-28T04:09:02.955Z',
  merchantFees: '0.00',
  sourceCurrency: 'CAD',
  sourceCurrencyName: 'Canadian Dollar',
  targetCurrency: 'CAD',
  targetCurrencyName: 'Canadian Dollar',
  batch: {
    id: 'B-1a2B3c4D5e6F7g8H9i0J1k',
    createdAt: '2017-03-21T20:56:43.690Z',
    updatedAt: '2017-03-28T04:09:02.966Z',
    sentAt: '2017-03-28T04:08:52.634Z',
    completedAt: '2017-03-28T04:08:54.353Z',
  },
  category: 'services',
  coverFees: false,
  currency: 'CAD',
  estimatedDeliveryAt: null,
  externalId: '',
  failureMessage: null,
  returnedAmount: '0.00',
}

describe('trolley transformPayout', () => {
  it('maps the documented payment', () => {
    const p = PayoutSchema.parse(transformPayout(DOC_PAYMENT))
    expect(p.id).toBe('P-1a2B3c4D5e6F7g8H9i0J1k')
    expect(p.amount).toBe(10010)
    expect(p.currency).toBe('CAD')
    expect(p.status).toBe('paid')
    expect(p.statementDescriptor).toBe('memo')
    expect(p.arrivalDate).toBeUndefined()
    expect(p.failureMessage).toBeUndefined()
    expect(Object.keys(p)).not.toContain('arrivalDate')
    expect(Object.keys(p)).not.toContain('failureMessage')
    expect(p.createdAt).toBe('2017-03-21T20:56:43.714Z')
    expect(p.updatedAt).toBe('2017-03-28T04:09:02.955Z')
    expect(p.metadata).toEqual({
      recipientId: 'R-1a2B3c4D5e6F7g8H9i0J1k',
      batchId: 'B-1a2B3c4D5e6F7g8H9i0J1k',
      targetAmount: '98.85',
      targetCurrency: 'CAD',
    })
  })

  it.each([
    ['pending', 'pending'],
    ['processing', 'in_transit'],
    ['processed', 'paid'],
    ['failed', 'failed'],
    ['returned', 'failed'],
    ['something-new', 'unknown'],
  ])('maps documented status %s to %s', (status, want) => {
    expect(PayoutSchema.parse(transformPayout({ ...DOC_PAYMENT, status })).status).toBe(want)
  })

  it('scales by the currency exponent (JPY has none)', () => {
    const p = transformPayout({ ...DOC_PAYMENT, sourceAmount: '1000', sourceCurrency: 'JPY' })
    expect(p.amount).toBe(1000)
  })

  it('throws rather than inventing an amount or currency', () => {
    expect(() => transformPayout({ ...DOC_PAYMENT, sourceAmount: undefined })).toThrow(
      /sourceAmount/,
    )
    expect(() => transformPayout({ ...DOC_PAYMENT, sourceCurrency: undefined })).toThrow(
      /sourceCurrency/,
    )
    expect(() => transformPayout({ ...DOC_PAYMENT, id: undefined })).toThrow(/no id/)
  })
})
