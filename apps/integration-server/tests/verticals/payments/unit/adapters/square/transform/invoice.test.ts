import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawSquareInvoice,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('square transformInvoice', () => {
  it('maps a PAID invoice with payment requests summed as total', () => {
    const raw: RawSquareInvoice = {
      id: 'SQ-INV-001',
      invoice_number: 'SQ-001',
      primary_recipient: { customer_id: 'CUST-001' },
      status: 'PAID',
      payment_requests: [
        { computed_amount_money: { amount: 5000, currency: 'USD' } },
        { computed_amount_money: { amount: 2500, currency: 'USD' } },
      ],
      payment_amount_due: { amount: 0, currency: 'USD' },
      amount_paid: { amount: 7500, currency: 'USD' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.total).toBe(7500)
    expect(result.amountDue).toBe(0)
    expect(result.amountPaid).toBe(7500)
    expect(result.customerId).toBe('CUST-001')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('square')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a DRAFT invoice', () => {
    const raw: RawSquareInvoice = {
      id: 'SQ-INV-002',
      status: 'DRAFT',
      payment_amount_due: { amount: 3000, currency: 'EUR' },
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED invoice to status "void"', () => {
    const raw: RawSquareInvoice = {
      id: 'SQ-INV-003',
      status: 'CANCELED',
      payment_amount_due: { amount: 0, currency: 'GBP' },
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
