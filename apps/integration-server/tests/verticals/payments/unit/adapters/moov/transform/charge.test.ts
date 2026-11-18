/**
 * Moov transfer → canonical Charge.
 *
 * Fixtures: the documented "List transfers" 200 example
 * (https://docs.moov.io/api/money-movement/transfers/list/), see ../fixtures.ts.
 * Status table (https://docs.moov.io/guides/money-movement/events-and-statuses/):
 * "created A transfer has been created", "queued …", "pending The transfer is in
 * progress, but not yet completed", "completed The transfer has completed",
 * "canceled …", "failed The transfer did not succeed", "reversed The transfer
 * completed, but funds were returned to the source".
 */
import { describe, it, expect } from 'vitest'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/moov/transform/charge'
import { CARD_PAYMENT_TRANSFER, DOC_EXAMPLE_WITHOUT_VALUE, SETTLED_CARD_PAYMENT } from '../fixtures'

describe('transformCharge (Moov transfer)', () => {
  it('maps the documented example transfer to a schema-valid charge', () => {
    const charge = ChargeSchema.parse(transformCharge(CARD_PAYMENT_TRANSFER as never))
    expect(charge).toEqual({
      id: 'd835gf30-4b19-4850-a9b2-c0624c41ecb3',
      externalId: 'd835gf30-4b19-4850-a9b2-c0624c41ecb3',
      amount: 1204,
      currency: 'USD',
      status: 'pending',
      customerId: '7e4b26c2-b399-49ef-8390-50e1ea44d550',
      paymentMethodId: '9506dbf6-4208-44c3-ad8a-e4431660e1f2',
      description: 'Transfer from card to wallet',
      gateway: 'moov',
      metadata: {},
      createdAt: '2025-01-21T21:32:16Z',
      raw: CARD_PAYMENT_TRANSFER,
    })
  })

  it('carries refunds, disputes, the invoice, the failure reason and metadata', () => {
    const charge = ChargeSchema.parse(transformCharge(SETTLED_CARD_PAYMENT as never))
    expect(charge.status).toBe('succeeded')
    expect(charge.amountRefunded).toBe(204)
    expect(charge.refundIds).toEqual(['rf-1'])
    expect(charge.disputeIds).toEqual(['dp-1'])
    expect(charge.invoiceId).toBe('inv-7a1b')
    expect(charge.metadata).toEqual({ orderRef: 'A-100' })
    const failed = transformCharge({
      ...CARD_PAYMENT_TRANSFER,
      status: 'failed',
      failureReason: 'source-payment-error',
    } as never)
    expect(failed.status).toBe('failed')
    expect(failed.failureCode).toBe('source-payment-error')
  })

  it.each([
    ['created', 'pending'],
    ['queued', 'pending'],
    ['pending', 'pending'],
    ['completed', 'succeeded'],
    ['failed', 'failed'],
    ['canceled', 'cancelled'],
    ['reversed', 'refunded'],
    ['something-new', 'unknown'],
  ])('maps transfer status %s to %s', (moov, canonical) => {
    const charge = transformCharge({ ...CARD_PAYMENT_TRANSFER, status: moov } as never)
    expect(ChargeSchema.parse(charge).status).toBe(canonical)
  })

  it('refuses the documented example as printed: its amount has no value', () => {
    expect(() => transformCharge(DOC_EXAMPLE_WITHOUT_VALUE as never)).toThrow(/amount/)
  })

  it('refuses a transfer with no currency rather than assuming one', () => {
    expect(() =>
      transformCharge({ ...CARD_PAYMENT_TRANSFER, amount: { value: 1204 } } as never),
    ).toThrow(/currency/)
  })
})

describe('transformCharge ingestion guards', () => {
  it('refuses a transfer without a transferID', () => {
    expect(() => transformCharge({ ...CARD_PAYMENT_TRANSFER, transferID: '' } as never)).toThrow(
      /transferID/,
    )
  })

  it('refuses a fractional amount value: Moov amounts are integer minor units', () => {
    expect(() =>
      transformCharge({
        ...CARD_PAYMENT_TRANSFER,
        amount: { currency: 'USD', value: 12.04 },
      } as never),
    ).toThrow(/amount\.value/)
  })
})
