import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawBilldeskInvoice,
} from '../../../../../../../src/verticals/payments/adapters/billdesk/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('billdesk transformInvoice', () => {
  it('maps a paid invoice to status "paid"', () => {
    const raw: RawBilldeskInvoice = {
      invoice_number: 'INV-001',
      invoice_display_number: 'INV-DISPLAY-001',
      mandateid: 'MANDATE-001',
      subscription_refid: 'SUB-REF-001',
      mercid: 'MERC001',
      invoice_date: '20240301',
      duedate: '20240310',
      debit_date: '20240301',
      amount: '299.00',
      currency: '356',
      status: 'paid',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('INV-001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(29900)
    expect(result.currency).toBe('INR')
    expect(result.amountPaid).toBe(29900)
    expect(result.amountDue).toBe(0)
    expect(result.subscriptionId).toBe('MANDATE-001')
    expect(result.number).toBe('INV-DISPLAY-001')
    expect(result.gateway).toBe('billdesk')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an unpaid invoice to status "open"', () => {
    const raw: RawBilldeskInvoice = {
      invoice_number: 'INV-002',
      mandateid: 'MANDATE-002',
      invoice_date: '20240301',
      duedate: '20240310',
      amount: '199.00',
      currency: '356',
      status: 'unpaid',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountDue).toBe(19900)
    expect(result.amountPaid).toBe(0)
    expect(result.paidAt).toBeUndefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled invoice to status "void"', () => {
    const raw: RawBilldeskInvoice = {
      invoice_number: 'INV-003',
      invoice_date: '20240301',
      amount: '99.00',
      currency: '356',
      status: 'cancelled',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a failed invoice to status "uncollectible"', () => {
    const raw: RawBilldeskInvoice = {
      invoice_number: 'INV-004',
      invoice_date: '20240301',
      amount: '150.00',
      currency: '356',
      status: 'failed',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('converts numeric currency code 356 to "INR"', () => {
    const raw: RawBilldeskInvoice = {
      invoice_number: 'INV-005',
      invoice_date: '20240301',
      amount: '500.00',
      currency: '356',
      status: 'paid',
    }
    const result = transformInvoice(raw)
    expect(result.currency).toBe('INR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
