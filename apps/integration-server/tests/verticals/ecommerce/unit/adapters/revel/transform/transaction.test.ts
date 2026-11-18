/**
 * Revel Payment → canonical Transaction, against the row orders_suite.yaml
 * (2025.3.0) documents for GET /resources/Payment/ and
 * /resources/Payment/{PaymentId}/. Its schema, verbatim where it matters:
 *
 *   amount:           type string, format float, "Amount of payment is done", example '2.660000'
 *   tip:              type string, format float, example '0.000000'
 *   payment_type:     EnumPaymentType (general_suite.yaml), "0 - OTHER", "1 - CASH",
 *                     "2 - CREDIT", "3 - CHECK", "4 - GIFT", … "8 - DEBIT", … "32 - DEPOSIT"
 *   payment_date:     date-time, "Date and time when the payment occurs", example 2018-07-18T04:00:00
 *   created_date:     date-time, "Date and time when payment is created", example 2018-07-18T04:00:00
 *   order:            uri, "URI of an Order API object for which this payment is created"
 *   transaction_status: "Response received and representing payment transaction status",
 *                     example "Accepted" — free text; no values are enumerated
 *
 * The datetimes carry no offset; like every offset-less upstream time here,
 * they are read as UTC (toIsoDatetime).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawRevelPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/revel/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

/** The documented example values of the Payment schema. */
function makePayment(overrides: Partial<RawRevelPayment> = {}): RawRevelPayment {
  return {
    id: 245733,
    order: '/resources/Order/516413/',
    amount: '2.660000',
    amount_authorized: '2.660000',
    tip: '0.000000',
    payment_type: 2,
    transaction_status: 'Accepted',
    transaction_id: '823826817',
    last_4_cc_digits: '1234',
    payment_date: '2018-07-18T04:00:00',
    created_date: '2018-07-18T04:00:00',
    updated_date: '2018-07-18T04:00:00',
    resource_uri: '/resources/Payment/245733/',
    ...overrides,
  }
}

describe('transformTransaction (Revel)', () => {
  it('maps the documented example row onto a valid Transaction', () => {
    const result = transformTransaction(makePayment())
    expect(result).toMatchObject({
      id: '245733',
      orderId: '516413',
      kind: 'SALE',
      amount: { amount: 266, currency: 'USD' },
      gateway: 'revel_credit',
      processedAt: '2018-07-18T04:00:00.000Z',
      createdAt: '2018-07-18T04:00:00.000Z',
    })
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('reads the documented string amount, and a numeric one alike', () => {
    expect(transformTransaction(makePayment({ amount: '12.500000' })).amount).toEqual({
      amount: 1250,
      currency: 'USD',
    })
    expect(transformTransaction(makePayment({ amount: 12.5 })).amount).toEqual({
      amount: 1250,
      currency: 'USD',
    })
  })

  it('leaves out an amount it cannot read rather than inventing one', () => {
    expect(transformTransaction(makePayment({ amount: 'n/a' })).amount).toBeUndefined()
    expect(transformTransaction(makePayment({ amount: undefined })).amount).toBeUndefined()
  })

  it.each([
    [0, 'revel_other'],
    [1, 'revel_cash'],
    [2, 'revel_credit'],
    [3, 'revel_check'],
    [4, 'revel_gift'],
    [8, 'revel_debit'],
    [11, 'revel_paypal'],
    [32, 'revel_deposit'],
  ])('names the gateway from the documented payment_type %i (%s)', (type, gateway) => {
    expect(transformTransaction(makePayment({ payment_type: type })).gateway).toBe(gateway)
  })

  it('falls back to revel for a payment_type the enum does not document', () => {
    expect(transformTransaction(makePayment({ payment_type: 99 })).gateway).toBe('revel')
    expect(transformTransaction(makePayment({ payment_type: undefined })).gateway).toBe('revel')
  })

  it('claims no status: transaction_status is free text with no documented values', () => {
    expect(transformTransaction(makePayment()).status).toBeUndefined()
  })

  it('processedAt is when the payment occurred, createdAt when it was recorded', () => {
    const result = transformTransaction(
      makePayment({ payment_date: '2018-07-18T04:00:00', created_date: '2018-07-19T09:30:00' }),
    )
    expect(result.processedAt).toBe('2018-07-18T04:00:00.000Z')
    expect(result.createdAt).toBe('2018-07-19T09:30:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePayment()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const minimal: RawRevelPayment = { id: 999 }
    const result = transformTransaction(minimal)
    expect(result.id).toBe('999')
    expect(result.kind).toBe('SALE')
    expect(result.gateway).toBe('revel')
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
