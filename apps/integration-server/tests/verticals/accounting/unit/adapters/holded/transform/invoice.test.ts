import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type HoldedInvoice,
  type HoldedInvoiceItem,
} from '../../../../../../../src/verticals/accounting/adapters/holded/transform/invoice'

function makeInvoiceItem(overrides: Partial<HoldedInvoiceItem> = {}): HoldedInvoiceItem {
  return {
    id: 'item-1',
    name: 'Widget',
    description: 'Premium widget',
    units: 2,
    subtotal: 1000,
    total: 1210,
    tax: 210,
    accountId: 'acc-1',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<HoldedInvoice> = {}): HoldedInvoice {
  return {
    id: 'inv-001',
    invoiceNum: 'F-2024-001',
    contact: 'contact-1',
    currency: 'EUR',
    subtotal: 1000,
    tax: 210,
    total: 1210,
    items: [],
    date: 1710460800, // 2024-03-15
    dueDate: 1713139200, // 2024-04-15
    status: 1,
    paid: 0,
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

  it('maps invoiceNum to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('F-2024-001')
  })

  it('maps contact to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('contact-1')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('maps total to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1210)
  })

  it('maps tax to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(210)
  })

  it('maps balanceAmount as total minus paid', () => {
    expect(transformInvoice(makeInvoice({ total: 1210, paid: 500 })).balanceAmount).toBe(710)
  })

  it('maps date (unix timestamp) to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date(1710460800 * 1000))
  })

  it('maps dueDate (unix timestamp) to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date(1713139200 * 1000))
  })

  it('returns undefined postedAt when date is 0', () => {
    expect(transformInvoice(makeInvoice({ date: 0 })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when status is 0', () => {
    expect(transformInvoice(makeInvoice({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when status is 1 with no payment', () => {
    expect(transformInvoice(makeInvoice({ status: 1, paid: 0 })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is 2', () => {
    expect(transformInvoice(makeInvoice({ status: 2 })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when status is 1 with partial payment', () => {
    expect(
      transformInvoice(makeInvoice({ status: 1, paid: 500, total: 1210 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status OVERDUE when status is 3', () => {
    expect(transformInvoice(makeInvoice({ status: 3 })).status).toBe('OVERDUE')
  })

  it('maps status VOIDED when status is 4', () => {
    expect(transformInvoice(makeInvoice({ status: 4 })).status).toBe('VOIDED')
  })

  it('maps items to lineItems', () => {
    const raw = makeInvoice({ items: [makeInvoiceItem()] })
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

  it('returns undefined invoiceNumber when invoiceNum is empty', () => {
    expect(transformInvoice(makeInvoice({ invoiceNum: '' })).invoiceNumber).toBeUndefined()
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
