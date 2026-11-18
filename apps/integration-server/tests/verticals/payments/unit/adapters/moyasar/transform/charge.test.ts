/**
 * Moyasar payment -> canonical Charge.
 *
 * The fixture is the documented example response of GET /payments
 * (https://docs.moyasar.com/api/payments/03-list-payments) and GET
 * /payments/:id (https://docs.moyasar.com/api/payments/02-fetch-payment). The
 * docs' example gives placeholder prose for the `timestamp` fields ("Date and
 * time when the payment was created."), so those four values are replaced by
 * ISO timestamps. The example's metadata.customer_email renders as
 * "[email protected]" (Cloudflare email obfuscation hides the literal), so the
 * key is kept with an example.com stand-in; every other key and value is the
 * documented example.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawMoyasarPayment,
} from '../../../../../../../src/verticals/payments/adapters/moyasar/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

function documented(overrides: Partial<RawMoyasarPayment> = {}): RawMoyasarPayment {
  return {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    status: 'initiated',
    amount: 100,
    fee: 0,
    currency: 'SAR',
    refunded: 0,
    refunded_at: null,
    captured: 0,
    captured_at: null,
    voided_at: null,
    description: 'Kindle Whitepaper',
    amount_format: '1.00 SAR',
    fee_format: '0.00 SAR',
    refunded_format: '0.00 SAR',
    captured_format: '0.00 SAR',
    invoice_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    ip: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    callback_url: 'https://example.com/checkout/payer-return',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-01-16T10:00:00.000Z',
    metadata: {
      cart_id: '72e470a5-cbc4-47b3-a52a-e89fda6adb19',
      customer_email: 'customer@example.com',
      customer_id: '23432',
    },
    source: {},
    ...overrides,
  }
}

describe('moyasar transformCharge', () => {
  it('maps the documented example payment and parses as a canonical Charge', () => {
    const result = ChargeSchema.parse(transformCharge(documented()))
    expect(result).toMatchObject({
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      externalId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      amount: 100,
      currency: 'SAR',
      amountRefunded: 0,
      amountCaptured: 0,
      status: 'pending',
      description: 'Kindle Whitepaper',
      invoiceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      gateway: 'moyasar',
      metadata: {
        cart_id: '72e470a5-cbc4-47b3-a52a-e89fda6adb19',
        customer_email: 'customer@example.com',
        customer_id: '23432',
      },
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-01-16T10:00:00.000Z',
    })
    expect(result.capturedAt).toBeUndefined()
  })

  it('passes amounts through as minor units ("amount": 100 is "1.00 SAR")', () => {
    const result = ChargeSchema.parse(
      transformCharge(documented({ amount: 12345, refunded: 45, captured: 12345 })),
    )
    expect(result.amount).toBe(12345)
    expect(result.amountRefunded).toBe(45)
    expect(result.amountCaptured).toBe(12345)
  })

  it('maps captured_at to capturedAt', () => {
    const result = ChargeSchema.parse(
      transformCharge(documented({ status: 'captured', captured_at: '2026-01-15T10:00:00Z' })),
    )
    expect(result.capturedAt).toBe('2026-01-15T10:00:00.000Z')
  })

  it.each([
    ['initiated', 'pending'],
    ['paid', 'succeeded'],
    ['authorized', 'pending'],
    ['failed', 'failed'],
    ['refunded', 'refunded'],
    ['captured', 'succeeded'],
    ['voided', 'cancelled'],
    ['verified', 'unknown'],
    ['something-new', 'unknown'],
  ] as const)('maps documented status %s to %s', (status, want) => {
    const result = ChargeSchema.parse(transformCharge(documented({ status })))
    expect(result.status).toBe(want)
  })

  it('never invents a currency: a payment without one throws', () => {
    const raw = documented()
    delete raw.currency
    expect(() => transformCharge(raw)).toThrow(/currency/)
  })

  it('never invents an amount: a payment without one throws', () => {
    const raw = documented()
    delete raw.amount
    expect(() => transformCharge(raw)).toThrow(/amount/)
  })

  it('never invents an id: a payment without one throws', () => {
    const raw = documented()
    delete raw.id
    expect(() => transformCharge(raw)).toThrow(/id/)
  })

  it('omits refunded/captured amounts the payment does not carry', () => {
    const raw = documented()
    delete raw.refunded
    delete raw.captured
    const result = ChargeSchema.parse(transformCharge(raw))
    expect(result.amountRefunded).toBeUndefined()
    expect(result.amountCaptured).toBeUndefined()
  })

  it('upper-cases the ISO-4217 currency code', () => {
    const result = ChargeSchema.parse(transformCharge(documented({ currency: 'sar' })))
    expect(result.currency).toBe('SAR')
  })

  it('rejects a non-integer amount ("amount integer required")', () => {
    expect(() => transformCharge(documented({ amount: 1.5 }))).toThrow(/amount/)
  })
})
