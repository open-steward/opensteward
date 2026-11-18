/**
 * Fixture: the documented example of GET /object-query/payments
 * (https://developer.zuora.com/v1-api-reference/api/object-queries/querypayments.md,
 * QueryPaymentsResponse example in `_bundle/v1-api-reference/api.yaml`).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawZuoraPayment,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const DOC_PAYMENT: RawZuoraPayment = {
  accountId: '8ad09be48db5aba7018db604776d4854',
  amount: 14.99,
  appliedAmount: 14.99,
  bankIdentificationNumber: '411111',
  comment: '',
  createdById: '8ad09fc28193c189018194da28be74ba',
  createdDate: '2024-08-29T00:53:29-07:00',
  currency: 'USD',
  effectiveDate: '2024-08-29',
  gateway: 'test',
  gatewayResponse: 'This transaction has been approved by Test gateway.',
  gatewayResponseCode: 'approve',
  gatewayState: 'Submitted',
  id: '8ad097b49198384c01919d200fb53143',
  paymentMethodId: '8ad084db90a5e73b0190c02783f552fa',
  paymentNumber: 'P-00000026',
  refundAmount: 0,
  status: 'Processed',
  type: 'Electronic',
  unappliedAmount: 0,
  updatedDate: '2024-08-29T00:53:30-07:00',
}

describe('zuora transformCharge (Payment)', () => {
  it('maps the documented payment example', () => {
    const c = ChargeSchema.parse(transformCharge(DOC_PAYMENT))
    expect(c.id).toBe('8ad097b49198384c01919d200fb53143')
    expect(c.amount).toBe(1499)
    expect(c.currency).toBe('USD')
    expect(c.amountRefunded).toBe(0)
    expect(c.status).toBe('succeeded')
    expect(c.customerId).toBe('8ad09be48db5aba7018db604776d4854')
    expect(c.paymentMethodId).toBe('8ad084db90a5e73b0190c02783f552fa')
    // An empty comment is no description; an approval message is no failure.
    expect(c.description).toBeUndefined()
    expect(c.failureMessage).toBeUndefined()
    expect(c.createdAt).toBe('2024-08-29T07:53:29.000Z')
    expect(c.updatedAt).toBe('2024-08-29T07:53:30.000Z')
  })

  it.each([
    ['Draft', 'pending'],
    ['Processing', 'pending'],
    ['Processed', 'succeeded'],
    ['Error', 'failed'],
    ['Canceled', 'cancelled'],
    ['Posted', 'unknown'],
  ])('maps documented status %s to %s', (status, expected) => {
    expect(ChargeSchema.parse(transformCharge({ ...DOC_PAYMENT, status })).status).toBe(expected)
  })

  it('carries the gateway response as the failure on an Error payment', () => {
    const c = ChargeSchema.parse(
      transformCharge({
        ...DOC_PAYMENT,
        status: 'Error',
        gatewayResponse: 'Card declined',
        gatewayResponseCode: 'decline',
      }),
    )
    expect(c.failureMessage).toBe('Card declined')
    expect(c.failureCode).toBe('decline')
  })

  it.each(['Draft', 'Processing', 'Processed', 'Canceled', 'Posted'])(
    'carries no failure on a %s payment, even with a gateway response',
    (status) => {
      const c = ChargeSchema.parse(transformCharge({ ...DOC_PAYMENT, status }))
      expect(c.failureCode).toBeUndefined()
      expect(c.failureMessage).toBeUndefined()
    },
  )

  it('carries the comment as the description', () => {
    expect(transformCharge({ ...DOC_PAYMENT, comment: 'Annual renewal' }).description).toBe(
      'Annual renewal',
    )
  })

  it('upper-cases the currency to the ISO 4217 form the schema requires', () => {
    const c = ChargeSchema.parse(transformCharge({ ...DOC_PAYMENT, currency: 'usd' }))
    expect(c.currency).toBe('USD')
  })

  it('scales by the currency exponent', () => {
    expect(transformCharge({ ...DOC_PAYMENT, currency: 'JPY', amount: 1500 }).amount).toBe(1500)
  })

  it('throws rather than inventing an amount or a currency', () => {
    expect(() => transformCharge({ ...DOC_PAYMENT, amount: undefined })).toThrow(
      /no amount or currency/,
    )
    expect(() => transformCharge({ ...DOC_PAYMENT, currency: undefined })).toThrow(
      /no amount or currency/,
    )
  })
})
