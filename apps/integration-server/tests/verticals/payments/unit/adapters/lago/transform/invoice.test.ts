import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawLagoInvoice,
} from '../../../../../../../src/verticals/payments/adapters/lago/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('lago transformInvoice', () => {
  it('maps a finalized paid invoice to status "paid"', () => {
    const raw: RawLagoInvoice = {
      lago_id: 'inv-001',
      number: 'INV-2024-001',
      status: 'finalized',
      payment_status: 'succeeded',
      currency: 'usd',
      total_amount_cents: 9900,
      taxes_amount_cents: 900,
      sub_total_excluding_taxes_amount_cents: 9000,
      customer: { external_id: 'ext-cust-001' },
      issuing_date: '2024-03-01',
      payment_due_date: '2024-04-01',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('ext-cust-001')
    expect(result.gateway).toBe('lago')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a draft invoice to status "draft"', () => {
    const raw: RawLagoInvoice = {
      lago_id: 'inv-002',
      status: 'draft',
      payment_status: 'pending',
      currency: 'EUR',
      total_amount_cents: 5000,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a voided invoice to status "void"', () => {
    const raw: RawLagoInvoice = {
      lago_id: 'inv-003',
      status: 'voided',
      currency: 'GBP',
      total_amount_cents: 0,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps amountPaid when payment_status is succeeded', () => {
    const raw: RawLagoInvoice = {
      lago_id: 'inv-004',
      status: 'finalized',
      payment_status: 'succeeded',
      currency: 'USD',
      total_amount_cents: 12000,
    }
    const result = transformInvoice(raw)
    expect(result.amountPaid).toBe(12000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
