import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawModernTreasuryInvoice,
} from '../../../../../../../src/verticals/payments/adapters/modern-treasury/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('modern-treasury transformInvoice', () => {
  it('maps a paid invoice with counterparty_id, total, and amount_paid', () => {
    const raw: RawModernTreasuryInvoice = {
      id: 'inv-001',
      number: 'INV-001',
      status: 'paid',
      currency: 'USD',
      counterparty_id: 'cp-001',
      total_amount: 9900,
      amount_paid: 9900,
      amount_remaining: 0,
      due_date: '2024-04-01T00:00:00Z',
      paid_at: '2024-03-15T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.status).toBe('paid')
    expect(result.total).toBe(9900)
    expect(result.amountPaid).toBe(9900)
    expect(result.customerId).toBe('cp-001')
    expect(result.gateway).toBe('modern-treasury')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps an unpaid invoice to status "open"', () => {
    const raw: RawModernTreasuryInvoice = {
      id: 'inv-002',
      status: 'unpaid',
      currency: 'EUR',
      total_amount: 5000,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a voided invoice to status "void"', () => {
    const raw: RawModernTreasuryInvoice = {
      id: 'inv-003',
      status: 'voided',
      currency: 'GBP',
      total_amount: 0,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a draft invoice to status "draft"', () => {
    const raw: RawModernTreasuryInvoice = {
      id: 'inv-004',
      status: 'draft',
      currency: 'USD',
      total_amount: 3000,
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
