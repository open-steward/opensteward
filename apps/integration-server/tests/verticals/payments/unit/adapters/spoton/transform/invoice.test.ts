import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('spoton transformInvoice', () => {
  it('maps a paid invoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_spoton_1',
      object: 'invoice',
      number: 'INV-001',
      customer: 'cus_spoton_1',
      subscription: 'sub_spoton_1',
      status: 'paid',
      currency: 'usd',
      subtotal: 10000,
      tax: 0,
      total: 10000,
      amount_due: 0,
      amount_paid: 10000,
      amount_remaining: 0,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv_spoton_1')
    expect(result.status).toBe('paid')
    expect(result.currency).toBe('USD')
    expect(result.total).toBe(10000)
    expect(result.customerId).toBe('cus_spoton_1')
    expect(result.gateway).toBe('stripe')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps draft status', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_spoton_2',
      object: 'invoice',
      status: 'draft',
      currency: 'eur',
      total: 5000,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps void status', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_spoton_3',
      object: 'invoice',
      status: 'void',
      currency: 'gbp',
      total: 2000,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformInvoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_spoton_4',
      object: 'invoice',
      customer: 'cus_spoton_2',
      subscription: 'sub_spoton_2',
      status: 'open',
      currency: 'usd',
      total: 3000,
      metadata: { key: 'val' },
    }
    const canonical = transformInvoice(raw)
    const back = untransformInvoice(canonical)
    expect(back.customer).toBe('cus_spoton_2')
    expect(back.subscription).toBe('sub_spoton_2')
    expect(back.metadata).toEqual({ key: 'val' })
  })
})
