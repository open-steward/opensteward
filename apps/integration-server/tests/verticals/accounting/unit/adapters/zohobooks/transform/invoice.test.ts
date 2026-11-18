import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ZohoBooksInvoice } from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/invoice'

function makeInvoice(overrides: Partial<ZohoBooksInvoice> = {}): ZohoBooksInvoice {
  return {
    invoice_id: 'zh-inv-001',
    invoice_number: 'INV-2024-001',
    customer_id: 'cust-42',
    customer_name: 'Acme Corp',
    date: '2024-01-15',
    due_date: '2024-02-15',
    currency_code: 'USD',
    total: 5000,
    balance: 5000,
    tax_total: 1000,
    status: 'sent',
    ...overrides,
  }
}

describe('transformInvoice (Zoho Books)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('zh-inv-001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('cust-42')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(1000)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('INVOICE')
  })

  it('maps "draft" to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps "sent" to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps "overdue" to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps "partially_paid" to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps "paid" to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid', balance: 0 })).status).toBe('PAID')
  })

  it('maps "void" to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'void' })).status).toBe('VOIDED')
  })

  it('computes paidAmount from total - balance', () => {
    const result = transformInvoice(makeInvoice({ total: 5000, balance: 2000 }))
    expect(result.paidAmount).toBe(3000)
    expect(result.balanceAmount).toBe(2000)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps line items', () => {
    const raw = makeInvoice({
      line_items: [
        {
          line_item_id: 'li-1',
          item_id: 'item-5',
          description: 'Consulting hours',
          rate: 100,
          quantity: 5,
          item_total: 500,
          tax_amount: 100,
          account_id: 'acc-10',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemId).toBe('item-5')
    expect(li.itemDescription).toBe('Consulting hours')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(100)
    expect(li.accountId).toBe('acc-10')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
