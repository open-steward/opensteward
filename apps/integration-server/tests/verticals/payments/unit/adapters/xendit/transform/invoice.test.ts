import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawXenditInvoice,
} from '../../../../../../../src/verticals/payments/adapters/xendit/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('xendit transformInvoice', () => {
  it('maps PAID status to "paid" and computes amountRemaining', () => {
    const raw: RawXenditInvoice = {
      id: 'inv-001',
      external_id: 'ext-001',
      status: 'PAID',
      currency: 'PHP',
      amount: 10000,
      paid_amount: 10000,
      customer_id: 'cust-1',
      paid_at: '2024-03-01T00:00:00Z',
      created: '2024-03-01T00:00:00Z',
      updated: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.total).toBe(10000)
    expect(result.amountPaid).toBe(10000)
    expect(result.amountRemaining).toBe(0)
    expect(result.currency).toBe('PHP')
    expect(result.gateway).toBe('xendit')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps EXPIRED status to "void"', () => {
    const raw: RawXenditInvoice = {
      id: 'inv-002',
      status: 'EXPIRED',
      currency: 'IDR',
      amount: 50000,
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(result.total).toBe(50000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING status to "open"', () => {
    const raw: RawXenditInvoice = {
      id: 'inv-003',
      status: 'PENDING',
      currency: 'USD',
      amount: 2500,
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps SETTLED status to "paid"', () => {
    const raw: RawXenditInvoice = {
      id: 'inv-004',
      status: 'SETTLED',
      currency: 'IDR',
      amount: 75000,
      paid_amount: 75000,
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
