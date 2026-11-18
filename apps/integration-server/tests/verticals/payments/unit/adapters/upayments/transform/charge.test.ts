import { describe, it, expect } from 'vitest'
import {
  transformSalesRow,
  transformTransaction,
} from '../../../../../../../src/verticals/payments/adapters/upayments/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { SALES_ROW, TRANSACTION } from '../fixtures'

describe('upayments transformSalesRow (GET /reports/sales row)', () => {
  it('maps the documented example row to a valid Charge', () => {
    const c = ChargeSchema.parse(transformSalesRow(SALES_ROW))
    expect(c.id).toBe('0198f00c2966e30a7c7f33edc6ec436fv2')
    expect(c.externalId).toBe('0198f00c2966e30a7c7f33edc6ec436fv2')
    // KWD has three decimals: "0.010" KWD = 10 fils.
    expect(c.amount).toBe(10)
    expect(c.currency).toBe('KWD')
    expect(c.status).toBe('unknown')
    expect(c.amountRefunded).toBeUndefined()
    expect(c.createdAt).toBe('2025-08-28T09:39:45.000Z')
    expect(c.metadata).toEqual({
      order_id: '0198f00c2966e30a7c7f33edc6ec4370',
      transaction_id: 'fcb601cd-f9b4-4e19-9ab8-002be06d8a9e',
    })
    expect(c.gateway).toBe('upayments')
  })

  it('maps a present refunded_amount to amountRefunded in minor units', () => {
    const c = ChargeSchema.parse(
      transformSalesRow({ ...SALES_ROW, grand_total: '1.500', refunded_amount: '0.250' }),
    )
    expect(c.amount).toBe(1500)
    expect(c.amountRefunded).toBe(250)
  })

  it('throws rather than inventing a currency or an amount', () => {
    expect(() => transformSalesRow({ ...SALES_ROW, currency: undefined })).toThrow(/currency/)
    expect(() => transformSalesRow({ ...SALES_ROW, grand_total: undefined })).toThrow(/grand_total/)
    expect(() => transformSalesRow({ ...SALES_ROW, track_id: undefined })).toThrow(/track_id/)
  })

  it('upper-cases a lowercase currency to the schema ISO code', () => {
    expect(ChargeSchema.parse(transformSalesRow({ ...SALES_ROW, currency: 'kwd' })).currency).toBe(
      'KWD',
    )
  })
})

describe('upayments transformTransaction (GET /get-payment-status)', () => {
  it('maps the documented example transaction to a valid Charge', () => {
    const c = ChargeSchema.parse(transformTransaction(TRANSACTION))
    expect(c.id).toBe('9bf8387bd32d45dda56f6c1c009eca4f')
    expect(c.amount).toBe(20000)
    expect(c.currency).toBe('KWD')
    expect(c.status).toBe('succeeded')
    expect(c.captured).toBe(true)
    // "2024-05-05 13:14:01" has no documented zone.
    expect(c.createdAt).toBeUndefined()
    expect(c.metadata).toEqual({
      order_id: '9bf8387beea04c368be502649d3fcbc8',
      payment_id: '100412610000005799',
      payment_type: 'knet',
    })
  })

  it.each([
    ['CAPTURED', 'succeeded'],
    ['AUTHORIZED', 'pending'],
    ['APPROVED', 'pending'],
    ['PENDING', 'pending'],
    ['NOT CAPTURED', 'failed'],
    ['CANCELED', 'cancelled'],
    ['FAILED', 'failed'],
    ['REFUND', 'refunded'],
    ['VOIDED', 'cancelled'],
    ['ERROR', 'failed'],
    ['SOMETHING_NEW', 'unknown'],
  ] as const)('maps documented result %s to %s', (result, status) => {
    const c = ChargeSchema.parse(transformTransaction({ ...TRANSACTION, result }))
    expect(c.status).toBe(status)
    expect(c.captured).toBe(status === 'succeeded' ? true : undefined)
  })

  it('maps a NULL result (processing) to pending', () => {
    expect(ChargeSchema.parse(transformTransaction({ ...TRANSACTION, result: null })).status).toBe(
      'pending',
    )
  })

  it('throws rather than inventing a currency', () => {
    expect(() => transformTransaction({ ...TRANSACTION, currency_type: undefined })).toThrow(
      /currency_type/,
    )
  })

  it('upper-cases a lowercase currency_type to the schema ISO code', () => {
    expect(
      ChargeSchema.parse(transformTransaction({ ...TRANSACTION, currency_type: 'kwd' })).currency,
    ).toBe('KWD')
  })
})
