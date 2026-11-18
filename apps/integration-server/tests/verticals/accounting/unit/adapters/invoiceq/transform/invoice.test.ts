import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type InvoiceqInvoice } from '../../../../../../../src/verticals/accounting/adapters/invoiceq/transform/invoice'

function makeRaw(overrides: Partial<InvoiceqInvoice> = {}): InvoiceqInvoice {
  return {
    id: '55',
    invoice_number: 'IQ-2024-055',
    invoice_date: '2024-04-01',
    due_date: '2024-04-30',
    sub_total: 3000,
    vat_amount: 150,
    total_amount: 3150,
    remaining_amount: 3150,
    status: 'Draft',
    customer_id: 'cust1',
    currency_code: 'QAR',
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (invoiceq)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('55')
    expect(result.invoiceNumber).toBe('IQ-2024-055')
    expect(result.totalAmount).toBe(3150)
    expect(result.taxAmount).toBe(150)
    expect(result.currency).toBe('QAR')
    expect(result.type).toBe('INVOICE')
    expect(result.contactId).toBe('cust1')
    expect(result.balanceAmount).toBe(3150)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-30'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Active status to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'Active' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      line_items: [
        {
          item_id: 'item1',
          description: 'Legal Services',
          quantity: 3,
          unit_price: 1000,
          total: 3000,
          vat_amount: 150,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('item1')
    expect(result.lineItems![0].itemDescription).toBe('Legal Services')
    expect(result.lineItems![0].unitQuantity).toBe(3)
    expect(result.lineItems![0].unitAmount).toBe(1000)
    expect(result.lineItems![0].totalAmount).toBe(3000)
    expect(result.lineItems![0].taxAmount).toBe(150)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformInvoice({ id: '0' })
    expect(result.id).toBe('0')
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
