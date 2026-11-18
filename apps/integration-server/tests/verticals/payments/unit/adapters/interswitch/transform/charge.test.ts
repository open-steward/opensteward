/**
 * Fixture: the first row of the documented example response of
 * GET /paymentgateway/api/v1/transactions
 * (https://docs.interswitchgroup.com/reference/get-transactions.md).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawInterswitchTransaction,
} from '../../../../../../../src/verticals/payments/adapters/interswitch/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const DOC_ROW: RawInterswitchTransaction = {
  id: 474489980,
  payableId: 33597,
  amount: 10000000,
  surcharge: 0,
  transactionReference: 'pay1685456807848',
  responseCode: 'Z0',
  payableCode: '9405967',
  payableName: 'complete gateway',
  merchantCode: 'MX6072',
  merchantCustomerName: null,
  channel: 'TRANSFER',
  currencyCode: '566',
  paymentCancelled: false,
  channelTransactionReference: null,
  merchantCustomerId: null,
  bankCode: null,
  dateOfPayment: '1685460429590',
  status: 'Incomplete',
  remittanceAmount: 0,
  responseDescription: 'Transaction not Completed',
  feeType: 'FEE_DETERMINED_AT_MERCHANT_X',
}

describe('interswitch transformCharge', () => {
  it('maps the documented example transaction', () => {
    const c = ChargeSchema.parse(transformCharge(DOC_ROW))
    expect(c.id).toBe('474489980')
    expect(c.externalId).toBe('474489980')
    expect(c.amount).toBe(10000000)
    expect(c.currency).toBe('NGN')
    expect(c.status).toBe('unknown')
    expect(c.customerId).toBeNull()
    expect(c.failureCode).toBeNull()
    expect(c.createdAt).toBe(new Date(1685460429590).toISOString())
    expect(c.gateway).toBe('interswitch')
    expect(c.metadata).toEqual({
      transactionReference: 'pay1685456807848',
      responseCode: 'Z0',
      channel: 'TRANSFER',
      merchantCode: 'MX6072',
    })
  })

  it('maps the documented status filter values', () => {
    expect(ChargeSchema.parse(transformCharge({ ...DOC_ROW, status: 'Success' })).status).toBe(
      'succeeded',
    )
    const failed = ChargeSchema.parse(
      transformCharge({
        ...DOC_ROW,
        status: 'FAILED',
        responseCode: 'Z1',
        responseDescription: 'Declined',
      }),
    )
    expect(failed.status).toBe('failed')
    expect(failed.failureCode).toBe('Z1')
    expect(failed.failureMessage).toBe('Declined')
    expect(ChargeSchema.parse(transformCharge({ ...DOC_ROW, paymentCancelled: true })).status).toBe(
      'cancelled',
    )
  })

  it('maps each documented numeric currency code', () => {
    expect(transformCharge({ ...DOC_ROW, currencyCode: '840' }).currency).toBe('USD')
    expect(transformCharge({ ...DOC_ROW, currencyCode: '404' }).currency).toBe('KES')
    expect(transformCharge({ ...DOC_ROW, currencyCode: '800' }).currency).toBe('UGX')
    // FAQ "DRC = 976"; ISO 4217 976 = Congolese franc.
    expect(transformCharge({ ...DOC_ROW, currencyCode: '976' }).currency).toBe('CDF')
  })

  it('throws on a currency code the docs do not map, rather than guessing', () => {
    expect(() => transformCharge({ ...DOC_ROW, currencyCode: '999' })).toThrow(/currencyCode/)
  })

  it('carries merchantCustomerId as customerId', () => {
    const c = ChargeSchema.parse(transformCharge({ ...DOC_ROW, merchantCustomerId: 'CUST-9' }))
    expect(c.customerId).toBe('CUST-9')
  })
})
