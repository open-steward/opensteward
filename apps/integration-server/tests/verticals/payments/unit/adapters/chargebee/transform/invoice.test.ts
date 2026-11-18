import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawChargebeeInvoice,
} from '../../../../../../../src/verticals/payments/adapters/chargebee/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

const baseRaw: RawChargebeeInvoice = {
  id: 'inv_001',
  customer_id: 'cust_123',
  subscription_id: 'sub_xyz',
  status: 'paid',
  currency_code: 'USD',
  sub_total: 4000,
  tax: 400,
  total: 4400,
  amount_paid: 4400,
  amount_due: 0,
  date: 1709251200, // 2024-03-01T00:00:00Z
  paid_at: 1709251200,
  line_items: [{ id: 'li_001' }, { id: 'li_002' }],
}

describe('chargebee transformInvoice', () => {
  it('maps status "paid" to "paid"', () => {
    const result = transformInvoice(baseRaw)
    expect(result.status).toBe('paid')
    expect(result.gateway).toBe('chargebee')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('surfaces total and currency', () => {
    const result = transformInvoice(baseRaw)
    expect(result.total).toBe(4400)
    expect(result.currency).toBe('USD')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps status "voided" to "void"', () => {
    const result = transformInvoice({ ...baseRaw, status: 'voided' })
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps status "not_paid" to "uncollectible"', () => {
    const result = transformInvoice({ ...baseRaw, status: 'not_paid' })
    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps status "payment_due" to "open"', () => {
    const result = transformInvoice({ ...baseRaw, status: 'payment_due' })
    expect(result.status).toBe('open')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('extracts line_item ids', () => {
    const result = transformInvoice(baseRaw)
    expect(result.lineItemIds).toEqual(['li_001', 'li_002'])
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('converts Unix-second date to ISO createdAt', () => {
    const result = transformInvoice(baseRaw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
