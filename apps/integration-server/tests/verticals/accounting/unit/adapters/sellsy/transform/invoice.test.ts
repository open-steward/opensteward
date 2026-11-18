import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type SellsyInvoice,
  type SellsyInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/invoice'

function makeInvoiceLine(overrides: Partial<SellsyInvoiceLine> = {}): SellsyInvoiceLine {
  return {
    id: 'line-1',
    product_id: 'prod-1',
    description: 'Consultation',
    quantity: 3,
    unit_amount: 100,
    total_amount: 300,
    tax_id: 'tax-1',
    tax_amount: 60,
    account_id: 'acc-1',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<SellsyInvoice> = {}): SellsyInvoice {
  return {
    id: 'inv-001',
    number: 'FA-2024-001',
    contact_id: 'contact-1',
    currency: 'EUR',
    date: '2024-03-15',
    due_date: '2024-04-15',
    status: 'invoiced',
    total_amount_untaxed: 8000,
    total_amount: 9600,
    tax_amount: 1600,
    paid_amount: 0,
    remaining_amount: 9600,
    lines: [],
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

  it('maps number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FA-2024-001')
  })

  it('maps contact_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('contact-1')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(9600)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(1600)
  })

  it('maps remaining_amount to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(9600)
  })

  it('maps date to postedAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps due_date to dueAt as Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformInvoice(makeInvoice({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when status is draft', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when invoiced with full remaining', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'invoiced', remaining_amount: 9600, paid_amount: 0 }))
        .status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is paid', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when invoiced with partial payment', () => {
    expect(
      transformInvoice(
        makeInvoice({ status: 'invoiced', remaining_amount: 4800, paid_amount: 4800 }),
      ).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when cancelled', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({ lines: [makeInvoiceLine()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemId).toBe('prod-1')
    expect(li.itemDescription).toBe('Consultation')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(300)
    expect(li.taxAmount).toBe(60)
    expect(li.accountId).toBe('acc-1')
    expect(li.taxrateId).toBe('tax-1')
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
