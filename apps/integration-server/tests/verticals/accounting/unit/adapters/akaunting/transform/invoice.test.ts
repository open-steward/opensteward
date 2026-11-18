import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type AkauntingInvoice,
  type AkauntingInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/invoice'

function makeInvoiceLine(overrides: Partial<AkauntingInvoiceLine> = {}): AkauntingInvoiceLine {
  return {
    id: 1,
    item_id: 10,
    name: 'Widget',
    description: 'Premium Widget',
    quantity: 2,
    price: 50.0,
    total: 100.0,
    tax: 25.0,
    tax_id: 3,
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<AkauntingInvoice> = {}): AkauntingInvoice {
  return {
    id: 101,
    document_number: 'INV-001',
    contact_id: 42,
    contact_name: 'Acme Corp',
    currency_code: 'EUR',
    issued_at: '2024-03-15',
    due_at: '2024-04-15',
    status: 'sent',
    amount: 1000,
    tax_total: 200,
    paid: 0,
    category_id: 5,
    items: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id from raw id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('101')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps document_number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-001')
  })

  it('maps contact_id to contactId as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps currency_code to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1000)
  })

  it('maps tax_total to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(200)
  })

  it('calculates balanceAmount as amount minus paid', () => {
    expect(transformInvoice(makeInvoice({ amount: 1000, paid: 300 })).balanceAmount).toBe(700)
  })

  it('maps issued_at to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps due_at to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when issued_at is empty', () => {
    expect(transformInvoice(makeInvoice({ issued_at: '' })).postedAt).toBeUndefined()
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

  it('maps status overdue to SUBMITTED', () => {
    expect(transformInvoice(makeInvoice({ status: 'overdue' })).status).toBe('SUBMITTED')
  })

  it('maps status paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status cancelled to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps items to lineItems', () => {
    const raw = makeInvoice({ items: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('10')
    expect(li.itemDescription).toBe('Premium Widget')
    expect(li.unitAmount).toBe(50.0)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(100.0)
    expect(li.taxAmount).toBe(25.0)
    expect(li.taxrateId).toBe('3')
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
