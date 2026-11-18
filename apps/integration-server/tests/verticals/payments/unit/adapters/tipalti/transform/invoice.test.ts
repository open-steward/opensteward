import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  transformInvoiceLineItem,
  type RawTipaltiInvoice,
  type RawTipaltiInvoiceLine,
} from '../../../../../../../src/verticals/payments/adapters/tipalti/transform/invoice'
import {
  InvoiceSchema,
  InvoiceLineItemSchema,
} from '../../../../../../../src/verticals/payments/schema/invoice'

describe('tipalti transformInvoice', () => {
  it('maps a PAID invoice with lines', () => {
    const raw: RawTipaltiInvoice = {
      id: 'inv-001',
      refCode: 'INV-REF-001',
      invoiceNumber: 'INV-2024-001',
      payeeId: 'payee-001',
      status: 'PAID',
      totalAmount: { amount: 500.0, currency: 'USD' },
      netAmount: { amount: 450.0, currency: 'USD' },
      taxAmount: { amount: 50.0, currency: 'USD' },
      dueDate: '2024-03-01T00:00:00Z',
      creationDate: '2024-03-01T00:00:00Z',
      lines: [
        { id: 'line-001', description: 'Services', amount: { amount: 500.0, currency: 'USD' } },
      ],
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.externalId).toBe('INV-REF-001')
    expect(result.number).toBe('INV-2024-001')
    expect(result.status).toBe('paid')
    expect(result.currency).toBe('USD')
    expect(result.total).toBe(50000)
    expect(result.subtotal).toBe(45000)
    expect(result.tax).toBe(5000)
    expect(result.customerId).toBe('payee-001')
    expect(result.gateway).toBe('tipalti')
    expect(result.lineItemIds).toEqual(['line-001'])
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING_PAYMENT invoice to open status', () => {
    const raw: RawTipaltiInvoice = {
      id: 'inv-002',
      status: 'PENDING_PAYMENT',
      totalAmount: { amount: 100.0, currency: 'EUR' },
      creationDate: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

describe('tipalti transformInvoiceLineItem', () => {
  it('maps a line item with quantity and unit price', () => {
    const raw: RawTipaltiInvoiceLine = {
      id: 'line-001',
      description: 'Consulting hours',
      quantity: 10,
      unitPrice: { amount: 50.0, currency: 'USD' },
      amount: { amount: 500.0, currency: 'USD' },
    }
    const result = transformInvoiceLineItem(raw, 'inv-001', 'USD')
    expect(result.id).toBe('line-001')
    expect(result.invoiceId).toBe('inv-001')
    expect(result.description).toBe('Consulting hours')
    expect(result.quantity).toBe(10)
    expect(result.unitAmount).toBe(5000)
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('USD')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})
