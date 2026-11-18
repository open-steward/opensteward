import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type CloudMeInvoice } from '../../../../../../../src/verticals/accounting/adapters/cloudme/transform/invoice'

function makeRaw(overrides: Partial<CloudMeInvoice> = {}): CloudMeInvoice {
  return {
    id: 'INV-2024-001',
    invoice_number: 'CM-INV-001',
    invoice_date: '2024-03-01',
    due_date: '2024-03-31',
    sub_total: 1000,
    tax: 50,
    total: 1050,
    balance_due: 1050,
    status: 'open',
    customer_id: 'CUST-001',
    currency_code: 'SAR',
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (cloudme)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('INV-2024-001')
    expect(result.totalAmount).toBe(1050)
    expect(result.taxAmount).toBe(50)
    expect(result.currency).toBe('SAR')
    expect(result.type).toBe('INVOICE')
  })

  it('maps invoiceNumber from invoice_number', () => {
    const result = transformInvoice(makeRaw())
    expect(result.invoiceNumber).toBe('CM-INV-001')
  })

  it('maps contactId from customer_id', () => {
    const result = transformInvoice(makeRaw())
    expect(result.contactId).toBe('CUST-001')
  })

  it('maps balanceAmount from balance_due', () => {
    const result = transformInvoice(makeRaw({ balance_due: 500 }))
    expect(result.balanceAmount).toBe(500)
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

  it('maps draft status correctly', () => {
    expect(transformInvoice(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps open status to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status correctly', () => {
    expect(transformInvoice(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps void status to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'void' })).status).toBe('VOIDED')
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      line_items: [
        {
          id: 'LI-1',
          description: 'Software license',
          quantity: 5,
          unit_price: 100,
          total: 500,
          tax_amount: 25,
          account_id: 'ACC-200',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('LI-1')
    expect(result.lineItems![0].unitQuantity).toBe(5)
    expect(result.lineItems![0].totalAmount).toBe(500)
    expect(result.lineItems![0].accountId).toBe('ACC-200')
  })

  it('returns empty lineItems when line_items is empty', () => {
    const result = transformInvoice(makeRaw({ line_items: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('handles missing date fields', () => {
    const result = transformInvoice(makeRaw({ invoice_date: '', due_date: '' }))
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
  })

  it('handles numeric customer_id correctly', () => {
    const result = transformInvoice(makeRaw({ customer_id: 42 }))
    expect(result.contactId).toBe('42')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
