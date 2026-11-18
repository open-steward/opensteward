import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('triple-a transformInvoice', () => {
  it('maps a paid invoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-ta-001',
      object: 'invoice',
      number: 'INV-TA-001',
      customer: 'cus-ta-001',
      status: 'paid',
      currency: 'usd',
      subtotal: 15000,
      total: 15000,
      amount_due: 0,
      amount_paid: 15000,
      amount_remaining: 0,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-ta-001')
    expect(result.status).toBe('paid')
    expect(result.currency).toBe('USD')
    expect(result.total).toBe(15000)
    expect(result.amountPaid).toBe(15000)
    expect(result.customerId).toBe('cus-ta-001')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an open invoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-ta-002',
      object: 'invoice',
      status: 'open',
      currency: 'EUR',
      total: 7500,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips subscriptionId via untransformInvoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv-ta-003',
      object: 'invoice',
      subscription: 'sub-ta-001',
      status: 'open',
      currency: 'USD',
      total: 1000,
    }
    const transformed = transformInvoice(raw)
    const back = untransformInvoice(transformed)
    expect(back.subscription).toBe('sub-ta-001')
  })
})
