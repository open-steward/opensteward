import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawIntasendInvoiceRecord,
} from '../../../../../../../src/verticals/payments/adapters/intasend/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('intasend transformInvoice', () => {
  it('maps a COMPLETE invoice to status "paid" with amountPaid set', () => {
    const raw: RawIntasendInvoiceRecord = {
      invoice_id: 'INV-001',
      state: 'COMPLETE',
      value: '100.00',
      currency: 'KES',
      charges: '2.50',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.total).toBe(10000)
    expect(result.amountPaid).toBe(10000)
    expect(result.amountRemaining).toBe(0)
    expect(result.currency).toBe('KES')
    expect(result.gateway).toBe('intasend')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a COMPLETED invoice to status "paid"', () => {
    const raw: RawIntasendInvoiceRecord = {
      invoice_id: 'INV-002',
      state: 'COMPLETED',
      value: '50.00',
      currency: 'KES',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.amountPaid).toBe(5000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED invoice to status "void"', () => {
    const raw: RawIntasendInvoiceRecord = {
      invoice_id: 'INV-003',
      state: 'FAILED',
      value: '20.00',
      currency: 'KES',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(result.amountPaid).toBeUndefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING invoice to status "open"', () => {
    const raw: RawIntasendInvoiceRecord = {
      invoice_id: 'INV-004',
      state: 'PENDING',
      value: '75.00',
      currency: 'KES',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountDue).toBe(7500)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('falls back to net_amount when value is absent', () => {
    const raw: RawIntasendInvoiceRecord = {
      id: 42,
      state: 'PENDING',
      net_amount: '33.00',
      currency: 'KES',
    }
    const result = transformInvoice(raw)
    expect(result.total).toBe(3300)
    expect(result.id).toBe('42')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
