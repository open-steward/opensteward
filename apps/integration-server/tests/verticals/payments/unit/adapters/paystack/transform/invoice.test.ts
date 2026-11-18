import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawPaystackInvoice,
} from '../../../../../../../src/verticals/payments/adapters/paystack/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('paystack transformInvoice', () => {
  it('maps a paid invoice to status "paid" with correct amounts', () => {
    const raw: RawPaystackInvoice = {
      id: 'inv_001',
      request_code: 'PRQ_abc123',
      description: 'Invoice for services',
      amount: 100000,
      currency: 'NGN',
      status: 'success',
      paid: true,
      paid_at: '2024-03-01T00:00:00Z',
      customer: { id: 42, customer_code: 'CUS_cust001', email: 'client@example.com' },
      tax: [{ name: 'VAT', amount: 7500 }],
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.total).toBe(100000)
    expect(result.amountPaid).toBe(100000)
    expect(result.amountDue).toBe(0)
    expect(result.amountRemaining).toBe(0)
    expect(result.tax).toBe(7500)
    expect(result.customerId).toBe('CUS_cust001')
    expect(result.gateway).toBe('paystack')
    expect(result.id).toBe('inv_001')
    expect(result.externalId).toBe('PRQ_abc123')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a draft invoice to status "draft"', () => {
    const raw: RawPaystackInvoice = {
      id: 'inv_002',
      request_code: 'PRQ_def456',
      amount: 50000,
      currency: 'NGN',
      status: 'draft',
      paid: false,
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(result.amountDue).toBe(50000)
    expect(result.amountPaid).toBe(0)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a pending invoice to status "open"', () => {
    const raw: RawPaystackInvoice = {
      id: 'inv_003',
      request_code: 'PRQ_ghi789',
      amount: 75000,
      currency: 'NGN',
      status: 'pending',
      paid: false,
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled invoice to status "void"', () => {
    const raw: RawPaystackInvoice = {
      id: 'inv_004',
      request_code: 'PRQ_jkl000',
      amount: 20000,
      currency: 'NGN',
      status: 'cancelled',
      paid: false,
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
