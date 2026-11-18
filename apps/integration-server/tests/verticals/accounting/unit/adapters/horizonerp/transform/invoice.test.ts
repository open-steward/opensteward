import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type HorizonErpInvoice } from '../../../../../../../src/verticals/accounting/adapters/horizonerp/transform/invoice'

function makeRaw(overrides: Partial<HorizonErpInvoice> = {}): HorizonErpInvoice {
  return {
    id: 'INV-001',
    bill_no: 'BILL-2024-001',
    bill_date: '2024-03-01',
    due_date: '2024-03-31',
    taxable_amount: 1000,
    tax_amount: 50,
    total_amount: 1050,
    due_amount: 1050,
    status: 'open',
    customer_id: 'CUST-001',
    currency: 'AED',
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (horizonerp)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('INV-001')
    expect(result.totalAmount).toBe(1050)
    expect(result.taxAmount).toBe(50)
    expect(result.currency).toBe('AED')
    expect(result.type).toBe('INVOICE')
  })

  it('maps invoiceNumber from bill_no', () => {
    const result = transformInvoice(makeRaw())
    expect(result.invoiceNumber).toBe('BILL-2024-001')
  })

  it('falls back to id when bill_no is empty', () => {
    const result = transformInvoice(makeRaw({ bill_no: '' }))
    expect(result.invoiceNumber).toBe('INV-001')
  })

  it('maps contactId from customer_id', () => {
    const result = transformInvoice(makeRaw())
    expect(result.contactId).toBe('CUST-001')
  })

  it('maps balanceAmount from due_amount', () => {
    const result = transformInvoice(makeRaw({ due_amount: 500 }))
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
          id: 'LI-1',
          name: 'Consulting',
          description: 'Consulting services',
          qty: 3,
          rate: 200,
          amount: 600,
          tax_amount: 30,
          hsn_code: 'HSN001',
          account_id: 'ACC-100',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('LI-1')
    expect(result.lineItems![0].unitQuantity).toBe(3)
    expect(result.lineItems![0].totalAmount).toBe(600)
  })

  it('returns empty lineItems when line_items is empty', () => {
    const result = transformInvoice(makeRaw({ line_items: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('handles missing date fields', () => {
    const result = transformInvoice(makeRaw({ bill_date: '', due_date: '' }))
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
