import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('truelayer transformInvoice', () => {
  it('maps a paid invoice with full fields', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_tl_001',
      object: 'invoice',
      number: 'INV-2024-001',
      customer: 'cus_tl_001',
      subscription: 'sub_tl_001',
      status: 'paid',
      currency: 'usd',
      total: 9900,
      amount_due: 9900,
      amount_paid: 9900,
      amount_remaining: 0,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv_tl_001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('cus_tl_001')
    expect(result.gateway).toBe('stripe')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an open invoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_tl_002',
      object: 'invoice',
      status: 'open',
      currency: 'eur',
      total: 4900,
      amount_due: 4900,
      amount_paid: 0,
      amount_remaining: 4900,
      created: 1709337600,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountRemaining).toBe(4900)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformInvoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_tl_003',
      object: 'invoice',
      customer: 'cus_tl_003',
      subscription: 'sub_tl_003',
      status: 'draft',
      currency: 'gbp',
      total: 2900,
    }
    const invoice = transformInvoice(raw)
    const back = untransformInvoice(invoice)
    expect(back.customer).toBe('cus_tl_003')
    expect(back.subscription).toBe('sub_tl_003')
  })
})
