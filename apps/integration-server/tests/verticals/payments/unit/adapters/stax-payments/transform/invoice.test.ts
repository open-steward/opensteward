/**
 * Fixture: the first row of the documented GET /invoice response example,
 * https://docs.staxpayments.com/reference/get-all-invoices. Statuses from
 * https://docs.staxpayments.com/reference/invoices.
 */
import { describe, it, expect } from 'vitest'
import { transformInvoice } from '../../../../../../../src/verticals/payments/adapters/stax-payments/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

const DOC_ROW = {
  id: '8cbb929d-55d9-43b5-8d90-af3cab04ce17',
  customer_id: '17a51927-312e-47e3-9b23-412f298888e3',
  total: 10,
  meta: { tax: 0, subtotal: 10 },
  status: 'SENT',
  sent_at: '2025-04-24 15:16:15',
  paid_at: null,
  schedule_id: 'e70c126c-f7b7-4673-a129-5b650f00f84a',
  url: 'https://app.staxpayments.com/#/bill/',
  created_at: '2025-04-08 20:49:04',
  updated_at: '2025-04-24 15:16:15',
  balance_due: 12,
  total_paid: 0,
}

describe('stax-payments transformInvoice', () => {
  it('maps the documented invoice example in the merchant currency', () => {
    const inv = InvoiceSchema.parse(transformInvoice(DOC_ROW, 'USD'))
    expect(inv.id).toBe('8cbb929d-55d9-43b5-8d90-af3cab04ce17')
    expect(inv.customerId).toBe('17a51927-312e-47e3-9b23-412f298888e3')
    expect(inv.subscriptionId).toBe('e70c126c-f7b7-4673-a129-5b650f00f84a')
    expect(inv.currency).toBe('USD')
    expect(inv.total).toBe(1000)
    expect(inv.subtotal).toBe(1000)
    expect(inv.tax).toBe(0)
    expect(inv.amountDue).toBe(1200)
    expect(inv.amountPaid).toBe(0)
    expect(inv.status).toBe('open')
    expect(inv.number).toBeUndefined()
    expect(inv.paidAt).toBeUndefined()
    expect(inv.createdAt).toBe('2025-04-08T20:49:04.000Z')
  })

  it('maps each documented status', () => {
    const s = (status: string) => transformInvoice({ ...DOC_ROW, status }, 'USD').status
    expect(s('DRAFT')).toBe('draft')
    expect(s('SENT')).toBe('open')
    expect(s('VIEWED')).toBe('open')
    expect(s('PARTIALLY APPLIED')).toBe('open')
    expect(s('ATTEMPTED')).toBe('open')
    expect(s('PAID')).toBe('paid')
    expect(s('DELETED')).toBe('unknown')
  })

  it('throws on an invoice without a total rather than reporting 0', () => {
    expect(() => transformInvoice({ ...DOC_ROW, total: null }, 'USD')).toThrow(/has no total/)
  })
})
