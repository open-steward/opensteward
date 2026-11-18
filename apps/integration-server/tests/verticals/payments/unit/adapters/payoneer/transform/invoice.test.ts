import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/payoneer/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('payoneer transformInvoice', () => {
  it('maps a paid invoice with all core fields', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_001',
      object: 'invoice',
      number: 'INV-001',
      customer: 'cus_001',
      subscription: 'sub_001',
      status: 'paid',
      currency: 'usd',
      total: 12500,
      amount_due: 12500,
      amount_paid: 12500,
      amount_remaining: 0,
      created: 1709251200,
    }

    const result = transformInvoice(raw)

    expect(result.id).toBe('inv_001')
    expect(result.number).toBe('INV-001')
    expect(result.customerId).toBe('cus_001')
    expect(result.subscriptionId).toBe('sub_001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(12500)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an open invoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_002',
      object: 'invoice',
      status: 'open',
      currency: 'EUR',
      total: 5000,
      created: 1709251200,
    }

    const result = transformInvoice(raw)

    expect(result.status).toBe('open')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformInvoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_003',
      object: 'invoice',
      customer: 'cus_003',
      subscription: 'sub_003',
      status: 'draft',
      currency: 'GBP',
      total: 2500,
      metadata: { source: 'api' },
      created: 1709251200,
    }

    const canonical = transformInvoice(raw)
    const back = untransformInvoice(canonical)

    expect(back.customer).toBe('cus_003')
    expect(back.subscription).toBe('sub_003')
    expect(() => InvoiceSchema.parse(canonical)).not.toThrow()
  })
})
