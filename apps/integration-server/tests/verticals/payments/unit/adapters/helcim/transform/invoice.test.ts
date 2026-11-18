import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawHelcimInvoice,
} from '../../../../../../../src/verticals/payments/adapters/helcim/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('helcim transformInvoice', () => {
  it('maps a PAID invoice to status "paid" with amountDue=0', () => {
    const raw: RawHelcimInvoice = {
      id: 501,
      invoiceNumber: 'INV-501',
      status: 'PAID',
      currency: 'CAD',
      amount: 99.99,
      customerId: 9001,
      datePaid: '2024-03-01 00:00:00',
      dateCreated: '2024-03-01 00:00:00',
      dateUpdated: '2024-03-01 00:00:00',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.total).toBe(9999)
    expect(result.amountDue).toBe(0)
    expect(result.amountPaid).toBe(9999)
    expect(result.number).toBe('INV-501')
    expect(result.customerId).toBe('9001')
    expect(result.gateway).toBe('helcim')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a DUE invoice to status "open"', () => {
    const raw: RawHelcimInvoice = {
      id: 502,
      invoiceNumber: 'INV-502',
      status: 'DUE',
      currency: 'USD',
      amount: 50.0,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountDue).toBe(5000)
    expect(result.amountPaid).toBeUndefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED invoice to status "void"', () => {
    const raw: RawHelcimInvoice = {
      id: 503,
      status: 'CANCELLED',
      currency: 'CAD',
      amount: 25.0,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a REFUNDED invoice to status "void"', () => {
    const raw: RawHelcimInvoice = {
      id: 504,
      status: 'REFUNDED',
      currency: 'CAD',
      amount: 75.0,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('computes subtotal from total minus tax plus discount', () => {
    const raw: RawHelcimInvoice = {
      id: 505,
      status: 'DUE',
      currency: 'CAD',
      amount: 110.0,
      tax: { amount: 10.0 },
      discounts: { amount: 5.0 },
    }
    const result = transformInvoice(raw)
    // subtotal = total(11000) - tax(1000) + discount(500) = 10500
    expect(result.total).toBe(11000)
    expect(result.tax).toBe(1000)
    expect(result.subtotal).toBe(10500)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps line item ids from lineItems array', () => {
    const raw: RawHelcimInvoice = {
      id: 506,
      status: 'DUE',
      currency: 'CAD',
      amount: 30.0,
      lineItems: [{ id: 101 }, { id: 102 }],
    }
    const result = transformInvoice(raw)
    expect(result.lineItemIds).toEqual(['101', '102'])
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to CAD when absent', () => {
    const raw: RawHelcimInvoice = {
      id: 507,
      status: 'DUE',
      amount: 20.0,
    }
    const result = transformInvoice(raw)
    expect(result.currency).toBe('CAD')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
