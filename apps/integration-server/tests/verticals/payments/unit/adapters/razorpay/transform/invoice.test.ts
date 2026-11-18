import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawRazorpayInvoice,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('razorpay transformInvoice', () => {
  it('maps a paid invoice to canonical with currency uppercased', () => {
    const raw: RawRazorpayInvoice = {
      id: 'inv_1',
      receipt: 'RCPT-001',
      customer_id: 'cust_abc',
      subscription_id: 'sub_xyz',
      status: 'paid',
      currency: 'inr',
      amount: 9900,
      amount_paid: 9900,
      amount_due: 0,
      date: 1_700_000_000,
      due_date: 1_700_500_000,
      paid_at: 1_700_100_000,
      short_url: 'https://rzp.io/i/abc',
      line_items: [{ id: 'li_1' }, { id: 'li_2' }],
      notes: { project: 'demo' },
    }
    const result = transformInvoice(raw)

    expect(result.id).toBe('inv_1')
    expect(result.number).toBe('RCPT-001')
    expect(result.customerId).toBe('cust_abc')
    expect(result.subscriptionId).toBe('sub_xyz')
    expect(result.status).toBe('paid')
    expect(result.currency).toBe('INR')
    expect(result.total).toBe(9900)
    expect(result.lineItemIds).toEqual(['li_1', 'li_2'])
    expect(result.gateway).toBe('razorpay')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a draft invoice status', () => {
    const raw: RawRazorpayInvoice = {
      id: 'inv_2',
      status: 'draft',
      currency: 'INR',
      amount: 1000,
      date: 1_700_000_000,
    }
    const result = transformInvoice(raw)

    expect(result.status).toBe('draft')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps cancelled invoice to void status', () => {
    const raw: RawRazorpayInvoice = {
      id: 'inv_3',
      status: 'cancelled',
      currency: 'INR',
      amount: 500,
      date: 1_700_000_000,
    }
    const result = transformInvoice(raw)

    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
