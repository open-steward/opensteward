import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type SunriseInvoice,
  type SunriseInvoiceItem,
} from '../../../../../../../src/verticals/accounting/adapters/sunrise/transform/invoice'

function makeInvoiceItem(overrides: Partial<SunriseInvoiceItem> = {}): SunriseInvoiceItem {
  return {
    id: 'item-1',
    name: 'Widget',
    description: 'Premium widget',
    quantity: 2,
    unit_price: 500,
    amount: 1210,
    tax_amount: 210,
    account_id: 'acc-1',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<SunriseInvoice> = {}): SunriseInvoice {
  return {
    id: 'inv-001',
    invoice_number: 'INV-2024-001',
    contact_id: 'contact-1',
    currency: 'USD',
    total_amount: 1210,
    tax_amount: 210,
    paid_amount: 0,
    balance_amount: 1210,
    line_items: [],
    date: '2024-03-15',
    due_date: '2024-04-15',
    status: 'sent',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id from raw id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps contact_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('contact-1')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1210)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(210)
  })

  it('maps balance_amount to balanceAmount', () => {
    expect(transformInvoice(makeInvoice({ balance_amount: 710 })).balanceAmount).toBe(710)
  })

  it('maps date (ISO string) to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps due_date (ISO string) to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformInvoice(makeInvoice({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps status draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status sent to SUBMITTED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('SUBMITTED')
  })

  it('maps status viewed to SUBMITTED', () => {
    expect(transformInvoice(makeInvoice({ status: 'viewed' })).status).toBe('SUBMITTED')
  })

  it('maps status paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status overdue to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps status void to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps line_items to lineItems', () => {
    const raw = makeInvoice({ line_items: [makeInvoiceItem()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-1')
    expect(li.itemName).toBe('Widget')
    expect(li.itemDescription).toBe('Premium widget')
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1210)
    expect(li.taxAmount).toBe(210)
    expect(li.accountId).toBe('acc-1')
  })

  it('returns undefined invoiceNumber when invoice_number is empty', () => {
    expect(transformInvoice(makeInvoice({ invoice_number: '' })).invoiceNumber).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
