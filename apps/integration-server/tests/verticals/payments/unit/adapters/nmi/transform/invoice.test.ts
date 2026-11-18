import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawNmiInvoice,
} from '../../../../../../../src/verticals/payments/adapters/nmi/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('nmi transformInvoice', () => {
  it('maps a paid invoice with all fields', () => {
    const raw: RawNmiInvoice = {
      invoiceId: 'inv-001',
      amount: '100.00',
      status: 'paid',
      currency: 'USD',
      orderDescription: 'Annual subscription',
      customerId: 'vault-001',
      orderId: 'ORD-001',
      created: '20240301000000',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.externalId).toBe('inv-001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(10000)
    expect(result.amountDue).toBe(0)
    expect(result.amountPaid).toBe(10000)
    expect(result.amountRemaining).toBe(0)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('vault-001')
    expect(result.number).toBe('ORD-001')
    expect(result.gateway).toBe('nmi')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an open invoice to status "open" with amountDue = total', () => {
    const raw: RawNmiInvoice = {
      invoiceId: 'inv-002',
      amount: '75.50',
      status: 'open',
      currency: 'USD',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.total).toBe(7550)
    expect(result.amountDue).toBe(7550)
    expect(result.amountRemaining).toBe(7550)
    expect(result.amountPaid).toBeUndefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a void/closed invoice to status "void"', () => {
    const raw: RawNmiInvoice = {
      invoiceId: 'inv-003',
      amount: '50.00',
      status: 'closed',
      currency: 'USD',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('computes subtotal and tax correctly when taxAmount is provided', () => {
    const raw: RawNmiInvoice = {
      invoiceId: 'inv-004',
      amount: '110.00',
      taxAmount: '10.00',
      status: 'paid',
      currency: 'USD',
    }
    const result = transformInvoice(raw)
    expect(result.total).toBe(11000)
    expect(result.tax).toBe(1000)
    expect(result.subtotal).toBe(10000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD and status to open for unknown values', () => {
    const raw: RawNmiInvoice = {
      invoiceId: 'inv-005',
      amount: '30.00',
    }
    const result = transformInvoice(raw)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('open')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
