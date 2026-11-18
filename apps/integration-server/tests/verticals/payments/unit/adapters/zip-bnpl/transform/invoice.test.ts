import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type RawStripeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('zip-bnpl transformInvoice', () => {
  it('maps id, currency, total and status correctly', () => {
    const raw: RawStripeInvoice = {
      id: 'zip-inv-001',
      object: 'invoice',
      currency: 'usd',
      total: 9900,
      status: 'paid',
      customer: 'cus-001',
      created: 1709251200,
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('zip-inv-001')
    expect(result.currency).toBe('USD')
    expect(result.total).toBe(9900)
    expect(result.status).toBe('paid')
    expect(result.customerId).toBe('cus-001')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps status "open" and line item ids', () => {
    const raw: RawStripeInvoice = {
      id: 'zip-inv-002',
      object: 'invoice',
      currency: 'eur',
      total: 4900,
      status: 'open',
      lines: { data: [{ id: 'li-001' }, { id: 'li-002' }] },
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.lineItemIds).toEqual(['li-001', 'li-002'])
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformInvoice', () => {
    const raw: RawStripeInvoice = {
      id: 'zip-inv-003',
      object: 'invoice',
      currency: 'gbp',
      total: 2000,
      status: 'draft',
      customer: 'cus-rt',
      subscription: 'sub-rt',
    }
    const result = transformInvoice(raw)
    const back = untransformInvoice(result)
    expect(back.customer).toBe('cus-rt')
    expect(back.subscription).toBe('sub-rt')
  })
})
