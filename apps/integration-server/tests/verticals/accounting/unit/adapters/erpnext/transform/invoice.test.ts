import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ErpNextInvoice } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/invoice'

function makeRaw(overrides: Partial<ErpNextInvoice> = {}): ErpNextInvoice {
  return {
    name: 'SINV-2024-00001',
    posting_date: '2024-01-15',
    due_date: '2024-02-15',
    base_grand_total: 1200,
    base_total_taxes_and_charges: 200,
    outstanding_amount: 1200,
    status: 'Submitted',
    currency: 'USD',
    customer: 'ACME Corp',
    remarks: 'Test invoice',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('SINV-2024-00001')
    expect(result.invoiceNumber).toBe('SINV-2024-00001')
    expect(result.contactId).toBe('ACME Corp')
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
    expect(result.balanceAmount).toBe(1200)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('INVOICE')
  })

  it('maps status Draft to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps status Submitted to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'Submitted' })).status).toBe('AUTHORIZED')
  })

  it('maps status Paid to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps status Cancelled to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('maps line items', () => {
    const result = transformInvoice(
      makeRaw({
        items: [{
          name: 'item-1',
          item_name: 'Widget',
          qty: 2,
          rate: 500,
          amount: 1000,
          item_tax_amount: 200,
          income_account: '4000',
        }],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Widget')
    expect(result.lineItems![0].totalAmount).toBe(1000)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
