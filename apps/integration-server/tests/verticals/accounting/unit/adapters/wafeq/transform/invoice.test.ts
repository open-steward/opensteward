import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type WafeqInvoice } from '../../../../../../../src/verticals/accounting/adapters/wafeq/transform/invoice'

function makeRaw(overrides: Partial<WafeqInvoice> = {}): WafeqInvoice {
  return {
    id: '1',
    invoice_number: 'INV-001',
    invoice_date: '2024-03-01',
    invoice_due_date: '2024-03-31',
    subtotal: 1000,
    tax_amount: 50,
    total: 1050,
    amount_due: 1050,
    status: 'draft',
    contact: 'c1',
    currency: 'AED',
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (wafeq)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('1')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.totalAmount).toBe(1050)
    expect(result.taxAmount).toBe(50)
    expect(result.currency).toBe('AED')
    expect(result.type).toBe('INVOICE')
    expect(result.contactId).toBe('c1')
    expect(result.balanceAmount).toBe(1050)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps issued status to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'issued' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      line_items: [
        {
          id: 'li1',
          description: 'Service',
          quantity: 2,
          price: 500,
          total: 1000,
          tax_amount: 50,
          account: 'acc1',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('li1')
    expect(result.lineItems![0].itemDescription).toBe('Service')
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(500)
    expect(result.lineItems![0].totalAmount).toBe(1000)
    expect(result.lineItems![0].taxAmount).toBe(50)
    expect(result.lineItems![0].accountId).toBe('acc1')
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformInvoice({ id: '99' })
    expect(result.id).toBe('99')
    expect(result.invoiceNumber).toBeUndefined()
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
