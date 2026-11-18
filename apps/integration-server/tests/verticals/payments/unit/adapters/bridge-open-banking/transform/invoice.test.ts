import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('bridge-open-banking transformInvoice', () => {
  it('maps a paid invoice with all fields', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-001',
      object: 'invoice',
      number: 'INV-0001',
      customer: 'cus-001',
      subscription: 'sub-001',
      status: 'paid',
      currency: 'usd',
      subtotal: 5000,
      total: 5000,
      amount_due: 5000,
      amount_paid: 5000,
      amount_remaining: 0,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.number).toBe('INV-0001')
    expect(result.customerId).toBe('cus-001')
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(5000)
    expect(result.gateway).toBe('stripe')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a draft invoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-002',
      object: 'invoice',
      status: 'draft',
      currency: 'eur',
      total: 2500,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips customerId and subscriptionId through untransformInvoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-003',
      object: 'invoice',
      customer: 'cus-003',
      subscription: 'sub-003',
      status: 'open',
      currency: 'usd',
      total: 1000,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    const back = untransformInvoice(result)
    expect(back.customer).toBe('cus-003')
    expect(back.subscription).toBe('sub-003')
  })
})
