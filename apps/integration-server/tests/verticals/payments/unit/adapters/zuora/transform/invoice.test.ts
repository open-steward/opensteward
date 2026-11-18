import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('zuora transformInvoice', () => {
  it('maps id, currency, total and status correctly', () => {
    const raw: RawStripeInvoice = {
      id: 'zuora-inv-001',
      object: 'invoice',
      currency: 'usd',
      total: 19900,
      status: 'paid',
      customer: 'cus-zuora-01',
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('zuora-inv-001')
    expect(result.currency).toBe('USD')
    expect(result.total).toBe(19900)
    expect(result.status).toBe('paid')
    expect(result.customerId).toBe('cus-zuora-01')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps status "draft" and line item ids', () => {
    const raw: RawStripeInvoice = {
      id: 'zuora-inv-002',
      object: 'invoice',
      currency: 'eur',
      total: 9900,
      status: 'draft',
      lines: { data: [{ id: 'li-zuora-01' }] },
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(result.lineItemIds).toEqual(['li-zuora-01'])
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformInvoice', () => {
    const raw: RawStripeInvoice = {
      id: 'zuora-inv-003',
      object: 'invoice',
      currency: 'gbp',
      total: 5000,
      status: 'open',
      customer: 'cus-rt',
      subscription: 'sub-rt',
    }
    const result = transformInvoice(raw)
    const back = untransformInvoice(result)
    expect(back.customer).toBe('cus-rt')
    expect(back.subscription).toBe('sub-rt')
  })
})
