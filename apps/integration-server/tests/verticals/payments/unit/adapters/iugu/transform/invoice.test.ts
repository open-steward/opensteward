import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawIuguInvoice,
} from '../../../../../../../src/verticals/payments/adapters/iugu/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('iugu transformInvoice', () => {
  it('maps a paid invoice with all fields', () => {
    const raw: RawIuguInvoice = {
      id: 'inv-001',
      status: 'paid',
      total_cents: 9900,
      paid_cents: 9900,
      currency: 'BRL',
      customer_id: 'cust-001',
      subscription_id: 'sub-001',
      secure_id: 'INV-2024-001',
      secure_url: 'https://iugu.com/invoice/INV-2024-001',
      financial_return_date: '2024-03-01T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(9900)
    expect(result.amountPaid).toBe(9900)
    expect(result.currency).toBe('BRL')
    expect(result.customerId).toBe('cust-001')
    expect(result.number).toBe('INV-2024-001')
    expect(result.hostedInvoiceUrl).toBe('https://iugu.com/invoice/INV-2024-001')
    expect(result.gateway).toBe('iugu')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a pending invoice to status "open"', () => {
    const raw: RawIuguInvoice = {
      id: 'inv-002',
      status: 'pending',
      total_cents: 5000,
      currency: 'BRL',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountPaid).toBeUndefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled invoice to status "void"', () => {
    const raw: RawIuguInvoice = {
      id: 'inv-003',
      status: 'cancelled',
      total_cents: 3000,
      currency: 'BRL',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an expired invoice to status "uncollectible"', () => {
    const raw: RawIuguInvoice = {
      id: 'inv-004',
      status: 'expired',
      total_cents: 1000,
      currency: 'BRL',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to BRL when absent', () => {
    const raw: RawIuguInvoice = {
      id: 'inv-005',
      status: 'pending',
      total_cents: 800,
    }
    const result = transformInvoice(raw)
    expect(result.currency).toBe('BRL')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
