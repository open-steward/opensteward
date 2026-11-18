import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('tyro transformInvoice', () => {
  it('maps a paid invoice with amounts and customer', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_tyro_001',
      object: 'invoice',
      number: 'INV-TYRO-001',
      customer: 'cus_tyro_001',
      status: 'paid',
      currency: 'aud',
      total: 9900,
      amount_due: 9900,
      amount_paid: 9900,
      amount_remaining: 0,
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv_tyro_001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(9900)
    expect(result.currency).toBe('AUD')
    expect(result.customerId).toBe('cus_tyro_001')
    expect(result.gateway).toBe('stripe')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an open invoice', () => {
    const raw: RawStripeInvoice = {
      id: 'inv_tyro_002',
      object: 'invoice',
      status: 'open',
      currency: 'aud',
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
      id: 'inv_tyro_003',
      object: 'invoice',
      customer: 'cus_tyro_003',
      subscription: 'sub_tyro_003',
      status: 'draft',
      currency: 'aud',
      total: 2500,
    }
    const invoice = transformInvoice(raw)
    const back = untransformInvoice(invoice)
    expect(back.customer).toBe('cus_tyro_003')
    expect(back.subscription).toBe('sub_tyro_003')
  })
})
