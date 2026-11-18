import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/interswitch/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('interswitch transformInvoice', () => {
  it('maps a paid invoice correctly', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-001',
      object: 'invoice',
      number: 'INV-001',
      customer: 'cust-001',
      subscription: 'sub-001',
      status: 'paid',
      currency: 'usd',
      subtotal: 10000,
      total: 10000,
      amount_due: 0,
      amount_paid: 10000,
      amount_remaining: 0,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(10000)
    expect(result.amountPaid).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('cust-001')
    expect(result.gateway).toBe('stripe')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an open invoice correctly', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-002',
      object: 'invoice',
      status: 'open',
      currency: 'eur',
      total: 5000,
      amount_due: 5000,
      amount_paid: 0,
      amount_remaining: 5000,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountRemaining).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformInvoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-003',
      object: 'invoice',
      customer: 'cust-002',
      subscription: 'sub-002',
      status: 'open',
      currency: 'usd',
      total: 7500,
    }
    const canonical = transformInvoice(raw)
    const back = untransformInvoice(canonical)
    expect(back.customer).toBe('cust-002')
    expect(back.subscription).toBe('sub-002')
  })
})
