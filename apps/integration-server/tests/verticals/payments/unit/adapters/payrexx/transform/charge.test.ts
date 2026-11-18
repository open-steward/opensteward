/**
 * transformCharge maps one Payrexx Transaction to the canonical Charge.
 *
 * The fixture is the first row of the documented "Retrieve Transactions"
 * example response (https://developers.payrexx.com/reference/retrieve-transactions.md),
 * trimmed of fields the transform does not read. Statuses are the Transaction
 * response model's constants in Payrexx's own PHP SDK
 * (lib/Payrexx/Models/Response/Transaction.php) plus "chargeback" from the
 * webhook docs (https://developers.payrexx.com/docs/webhooks.md).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPayrexxTransaction,
} from '../../../../../../../src/verticals/payments/adapters/payrexx/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

function documented(): RawPayrexxTransaction {
  return {
    id: 1,
    uuid: 'f384000b',
    status: 'authorized',
    time: '2020-01-20 15:56:02',
    lang: 'de',
    pageUuid: '892dcf5c',
    payoutUuid: 'abcd1234',
    psp: 'Payrexx_Payments',
    pspId: 26,
    mode: 'LIVE',
    referenceId: 'ORDER#321',
    invoice: {
      currencyAlpha3: 'CHF',
      products: [
        { quantity: 1, name: 'Hoodie', amount: 5900 },
        { quantity: 2, name: 'T-Shirt', amount: 2850 },
      ],
      discount: { code: 'SUPERSALE', percentage: 33, amount: 3828 },
      shippingAmount: 150000,
      totalAmount: 9272,
      customFields: null,
    },
    refundable: true,
    partiallyRefundable: true,
    contact: { id: 16, uuid: '9c9c0282', email: 'info@example.com' },
  }
}

describe('payrexx transformCharge', () => {
  it('maps the documented Transaction example and parses as a Charge', () => {
    const result = ChargeSchema.parse(transformCharge(documented()))
    expect(result.id).toBe('1')
    expect(result.externalId).toBe('1')
    expect(result.amount).toBe(9272)
    expect(result.currency).toBe('CHF')
    expect(result.status).toBe('pending')
    expect(result.customerId).toBe('16')
    expect(result.metadata).toEqual({ referenceId: 'ORDER#321' })
    expect(result.gateway).toBe('payrexx')
    expect(result.createdAt).toBeUndefined()
  })

  it.each([
    ['confirmed', 'succeeded'],
    ['refund_pending', 'succeeded'],
    ['initiated', 'pending'],
    ['waiting', 'pending'],
    ['authorized', 'pending'],
    ['reserved', 'pending'],
    ['uncaptured', 'pending'],
    ['cancelled', 'cancelled'],
    ['expired', 'cancelled'],
    ['declined', 'failed'],
    ['error', 'failed'],
    ['insecure', 'failed'],
    ['refunded', 'refunded'],
    ['partially-refunded', 'partially_refunded'],
    ['disputed', 'disputed'],
    ['chargeback', 'disputed'],
    ['something-new', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    const result = ChargeSchema.parse(transformCharge({ ...documented(), status }))
    expect(result.status).toBe(expected)
  })

  it('throws rather than inventing an amount when invoice.totalAmount is absent', () => {
    const raw = documented()
    raw.invoice = { currencyAlpha3: 'CHF' }
    expect(() => transformCharge(raw)).toThrow(/totalAmount/)
  })

  it('throws rather than defaulting a currency when invoice.currencyAlpha3 is absent', () => {
    const raw = documented()
    raw.invoice = { totalAmount: 9272 }
    expect(() => transformCharge(raw)).toThrow(/currencyAlpha3/)
  })

  it('throws rather than emitting an empty id', () => {
    const raw = documented()
    delete raw.id
    expect(() => transformCharge(raw)).toThrow(/id/)
  })

  it('omits customerId when the transaction has no contact', () => {
    const raw = documented()
    delete raw.contact
    const result = ChargeSchema.parse(transformCharge(raw))
    expect(result.customerId).toBeUndefined()
  })
})
