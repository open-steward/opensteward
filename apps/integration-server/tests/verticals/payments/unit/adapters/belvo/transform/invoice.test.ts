import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawBelvoInvoiceDetail,
} from '../../../../../../../src/verticals/payments/adapters/belvo/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('belvo transformInvoice', () => {
  it('maps a Vigente (valid) invoice to status "paid"', () => {
    const raw: RawBelvoInvoiceDetail = {
      id: 'inv-001',
      link: 'link-abc',
      invoice_identification: 'UUID-001',
      invoice_date: '2024-03-01',
      collected_at: '2024-03-01T00:00:00Z',
      status: 'Vigente',
      invoice_type: 'Ingreso',
      type: 'INFLOW',
      sender_id: 'RFC-SENDER',
      sender_name: 'ACME Corp',
      total_amount: 1160.0,
      subtotal_amount: 1000.0,
      tax_amount: 160.0,
      currency: 'MXN',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(116000)
    expect(result.currency).toBe('MXN')
    expect(result.customerId).toBe('RFC-SENDER')
    expect(result.number).toBe('UUID-001')
    expect(result.gateway).toBe('belvo')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a Cancelado invoice to status "void"', () => {
    const raw: RawBelvoInvoiceDetail = {
      id: 'inv-002',
      invoice_identification: 'UUID-002',
      invoice_date: '2024-03-01',
      collected_at: '2024-03-01T00:00:00Z',
      status: 'Cancelado',
      total_amount: 500.0,
      currency: 'MXN',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(result.amountDue).toBeUndefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('sets tax and subtotal correctly', () => {
    const raw: RawBelvoInvoiceDetail = {
      id: 'inv-003',
      invoice_date: '2024-03-01',
      collected_at: '2024-03-01T00:00:00Z',
      status: 'Vigente',
      total_amount: 580.0,
      subtotal_amount: 500.0,
      tax_amount: 80.0,
      currency: 'MXN',
    }
    const result = transformInvoice(raw)
    expect(result.subtotal).toBe(50000)
    expect(result.tax).toBe(8000)
    expect(result.total).toBe(58000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('falls back to folio for invoice number when invoice_identification is absent', () => {
    const raw: RawBelvoInvoiceDetail = {
      id: 'inv-004',
      folio: 'FOLIO-001',
      invoice_date: '2024-03-01',
      collected_at: '2024-03-01T00:00:00Z',
      status: 'Vigente',
      total_amount: 100.0,
      currency: 'MXN',
    }
    const result = transformInvoice(raw)
    expect(result.number).toBe('FOLIO-001')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
