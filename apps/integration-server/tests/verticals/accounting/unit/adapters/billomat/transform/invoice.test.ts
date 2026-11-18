import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type BillomatInvoice,
  type BillomatInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/invoice'

function makeInvoiceLine(overrides: Partial<BillomatInvoiceLine> = {}): BillomatInvoiceLine {
  return {
    id: 'line-1',
    article_id: 'art-1',
    description: 'Beratung',
    quantity: 2,
    unit_price: 500,
    total_gross: 1000,
    tax_rate: 19,
    tax_amount: 190,
    account_id: 'acc-1',
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<BillomatInvoice> = {}): BillomatInvoice {
  return {
    id: 'inv-001',
    invoice_number: 'RE-1001',
    client_id: 'client-1',
    currency_code: 'EUR',
    date: '2024-03-15',
    due_date: '2024-04-15',
    status: 'OPEN',
    total_gross: 11900,
    total_net: 10000,
    tax_amount: 1900,
    paid_amount: 0,
    open_amount: 11900,
    invoice_items: [],
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
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('RE-1001')
  })

  it('maps client_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('client-1')
  })

  it('maps currency_code to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('maps total_gross to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(11900)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(1900)
  })

  it('maps open_amount to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(11900)
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

  it('maps status DRAFT when status is DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when OPEN with no payment', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'OPEN', paid_amount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is PAID', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'PAID' })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when OPEN with partial payment', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'OPEN', paid_amount: 5000, open_amount: 6900 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when CANCELED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CANCELED' })).status).toBe('VOIDED')
  })

  it('maps invoice_items to lineItems', () => {
    const raw = makeInvoice({
      invoice_items: [makeInvoiceLine()],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemId).toBe('art-1')
    expect(li.itemDescription).toBe('Beratung')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(190)
    expect(li.accountId).toBe('acc-1')
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
