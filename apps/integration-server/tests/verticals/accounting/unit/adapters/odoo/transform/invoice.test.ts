import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type OdooInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/odoo/transform/invoice'

function makeInvoice(overrides: Partial<OdooInvoice> = {}): OdooInvoice {
  return {
    id: 101,
    name: 'INV/2024/001',
    partner_id: [8, 'Customer Corp'],
    invoice_date: '2024-06-01',
    invoice_date_due: '2024-06-30',
    currency_id: [1, 'EUR'],
    amount_total: 1190,
    amount_residual: 1190,
    amount_tax: 190,
    state: 'posted',
    payment_state: 'not_paid',
    invoice_line_ids: [1, 2],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id correctly', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('101')
  })

  it('maps name to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV/2024/001')
  })

  it('maps partner_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('8')
  })

  it('maps currency_id display name to currency', () => {
    // Odoo many2one values arrive as [id, display_name], and for res.currency
    // the display name is the record's `name` — the ISO code. Same mapping the
    // eight sibling Odoo transforms already use.
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('omits currency when currency_id is absent', () => {
    expect(transformInvoice(makeInvoice({ currency_id: undefined as never })).currency).toBeUndefined()
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps amount_total to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1190)
  })

  it('maps amount_tax to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(190)
  })

  it('maps amount_residual to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(1190)
  })

  it('parses invoice_date as Date object', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('parses invoice_date_due as Date object', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-06-30'))
  })

  it('maps state draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ state: 'draft' })).status).toBe('DRAFT')
  })

  it('maps state cancel to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ state: 'cancel' })).status).toBe('VOIDED')
  })

  it('maps payment_state paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ state: 'posted', payment_state: 'paid' })).status).toBe('PAID')
  })

  it('maps payment_state partial to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ state: 'posted', payment_state: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps posted state with not_paid to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ state: 'posted', payment_state: 'not_paid' })).status).toBe('AUTHORIZED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
