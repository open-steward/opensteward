/**
 * Instamojo payment -> canonical Charge.
 *
 * The fixture is the documented example row of MDP "List Payments"
 * (https://docs.instamojo.com/v2-mdp/reference/payments.md), GET
 * https://api.instamojo.com/v2/payments/. Status and failure semantics come
 * from "Get Payment Details" (https://docs.instamojo.com/reference/get-payment-details-1.md):
 *
 *   "status" ... "* **true** => Successful\n* **false** => Failed\n* **null** => Initiated"
 *   "failure" ... "reason => Type of failure.\nmessage => Failure message returned by upstream provider."
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawInstamojoPayment,
} from '../../../../../../../src/verticals/payments/adapters/instamojo/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

/** The documented example row, verbatim apart from JSON quoting. */
const DOC_PAYMENT: RawInstamojoPayment = {
  id: 'MOJO9520R12A973123120',
  title: 'test payment',
  payment_type: 'instapay',
  status: true,
  link: 'https://test.instamojo.com/v2/links/<value>/',
  product: null,
  seller: 'https://test.instamojo.com/v2/users/<value>/',
  currency: 'INR',
  amount: '9494.00',
  name: 'buyer',
  email: 'buyer@email.com',
  phone: '+919876543210',
  payout: null,
  fees: '192.88',
  total_taxes: '34.72',
  cases: [],
  instrument_type: 'CARD',
  billing_instrument: 'International Regular Credit Card (Visa/Mastercard)',
  failure: null,
  created_at: '2019-05-20T09:30:23.808234Z',
  updated_at: '2019-05-24T07:45:04.639332Z',
  tax_invoice_id: '0355221229/000006',
  resource_uri: 'https://test.instamojo.com/v2/payments/<value>/',
}

describe('instamojo transformCharge', () => {
  it('maps the documented List Payments row and parses as a canonical Charge', () => {
    const out = ChargeSchema.parse(transformCharge(DOC_PAYMENT))
    expect(out.id).toBe('MOJO9520R12A973123120')
    expect(out.externalId).toBe('MOJO9520R12A973123120')
    // "amount": "9494.00" INR is a major-unit decimal: 949400 paise.
    expect(out.amount).toBe(949400)
    expect(out.currency).toBe('INR')
    expect(out.status).toBe('succeeded')
    expect(out.description).toBe('test payment')
    expect(out.failureCode).toBeUndefined()
    expect(out.failureMessage).toBeUndefined()
    expect(out.createdAt).toBe('2019-05-20T09:30:23.808Z')
    expect(out.updatedAt).toBe('2019-05-24T07:45:04.639Z')
    expect(out.gateway).toBe('instamojo')
    expect(out.metadata).toEqual({})
    expect(out.raw).toBe(DOC_PAYMENT)
  })

  it('maps status false to failed and reads the documented failure object', () => {
    const out = ChargeSchema.parse(
      transformCharge({
        ...DOC_PAYMENT,
        status: false,
        failure: { reason: 'declined', message: 'Card declined by bank' },
      }),
    )
    expect(out.status).toBe('failed')
    expect(out.failureCode).toBe('declined')
    expect(out.failureMessage).toBe('Card declined by bank')
  })

  it('maps status null (Initiated) to pending', () => {
    const out = ChargeSchema.parse(transformCharge({ ...DOC_PAYMENT, status: null }))
    expect(out.status).toBe('pending')
  })

  it('maps an undocumented status value to unknown', () => {
    const out = ChargeSchema.parse(
      transformCharge({ ...DOC_PAYMENT, status: 'weird' as unknown as boolean }),
    )
    expect(out.status).toBe('unknown')
  })

  it('throws rather than inventing an amount or a currency', () => {
    expect(() =>
      transformCharge({ ...DOC_PAYMENT, amount: undefined as unknown as string }),
    ).toThrow(/amount/)
    expect(() => transformCharge({ ...DOC_PAYMENT, amount: 'n/a' })).toThrow(/amount/)
    expect(() =>
      transformCharge({ ...DOC_PAYMENT, currency: undefined as unknown as string }),
    ).toThrow(/currency/)
  })
})
