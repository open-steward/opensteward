import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawAirwallexInvoice,
} from '../../../../../../../src/verticals/payments/adapters/airwallex/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('airwallex transformInvoice', () => {
  it('maps payment_status "PAID" to "paid" and passes minor-unit amounts through unchanged', () => {
    const raw: RawAirwallexInvoice = {
      id: 'inv-001',
      invoice_number: 'INV-001',
      billing_customer_id: 'cus-001',
      subscription_id: 'sub-001',
      currency: 'usd',
      status: 'FINALIZED',
      payment_status: 'PAID',
      subtotal: 10000,
      tax: 0,
      total: 10000,
      amount_due: 0,
      amount_paid: 10000,
      amount_remaining: 0,
      paid_at: '2024-03-01T12:00:00+0000',
      created_at: '2024-03-01T10:00:00+0000',
      updated_at: '2024-03-01T12:00:00+0000',
      line_items: [{ id: 'li-001', amount: 10000, currency: 'usd' }],
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.total).toBe(10000)
    expect(result.subtotal).toBe(10000)
    expect(result.amountPaid).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('cus-001')
    expect(result.gateway).toBe('airwallex')
    expect(result.lineItemIds).toEqual(['li-001'])
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps payment_status "VOID" to "void"', () => {
    const raw: RawAirwallexInvoice = {
      id: 'inv-002',
      currency: 'EUR',
      status: 'FINALIZED',
      payment_status: 'VOID',
      total: 5000,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps payment_status "UNCOLLECTIBLE" to "uncollectible"', () => {
    const raw: RawAirwallexInvoice = {
      id: 'inv-003',
      currency: 'GBP',
      payment_status: 'UNCOLLECTIBLE',
      total: 2000,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps status "DRAFT" + unpaid to "draft"', () => {
    const raw: RawAirwallexInvoice = {
      id: 'inv-004',
      currency: 'USD',
      status: 'DRAFT',
      payment_status: 'UNPAID',
      total: 3000,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps FINALIZED + UNPAID to "open"', () => {
    const raw: RawAirwallexInvoice = {
      id: 'inv-005',
      currency: 'AUD',
      status: 'FINALIZED',
      payment_status: 'UNPAID',
      total: 8000,
      amount_due: 8000,
      amount_remaining: 8000,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountDue).toBe(8000)
    expect(result.amountRemaining).toBe(8000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('omits lineItemIds when line_items array is empty', () => {
    const raw: RawAirwallexInvoice = {
      id: 'inv-006',
      currency: 'USD',
      payment_status: 'PAID',
      total: 1000,
      line_items: [],
    }
    const result = transformInvoice(raw)
    expect(result.lineItemIds).toBeUndefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
