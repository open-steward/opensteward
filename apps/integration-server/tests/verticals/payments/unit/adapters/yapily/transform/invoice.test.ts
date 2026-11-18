import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/yapily/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('yapily transformInvoice (stripe-scaffold)', () => {
  it('maps a paid invoice with amounts and line items', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-001',
      object: 'invoice',
      number: 'INV-001',
      customer: 'cus-001',
      subscription: 'sub-001',
      status: 'paid',
      currency: 'usd',
      subtotal: 10000,
      total: 10000,
      amount_due: 0,
      amount_paid: 10000,
      amount_remaining: 0,
      lines: { data: [{ id: 'il-001' }] },
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.total).toBe(10000)
    expect(result.amountPaid).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(result.lineItemIds).toEqual(['il-001'])
    expect(result.gateway).toBe('stripe')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a void invoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-002',
      object: 'invoice',
      status: 'void',
      currency: 'gbp',
      total: 5000,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformInvoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-003',
      object: 'invoice',
      customer: 'cus-003',
      status: 'open',
      currency: 'eur',
      total: 2500,
      created: 1709251200,
    }
    const canonical = transformInvoice(raw)
    expect(() => InvoiceSchema.parse(canonical)).not.toThrow()
    const out = untransformInvoice(canonical)
    expect(out.customer).toBe('cus-003')
  })
})
