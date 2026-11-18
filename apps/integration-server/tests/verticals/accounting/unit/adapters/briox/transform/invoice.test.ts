import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type BrioxInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/briox/transform/invoice'

function makeInvoice(overrides: Partial<BrioxInvoice> = {}): BrioxInvoice {
  return {
    id: 101,
    invoice_number: 'INV-101',
    contact_id: 42,
    invoice_date: '2024-04-01',
    due_date: '2024-04-30',
    currency: 'SEK',
    total: 12500,
    vat_amount: 2500,
    remaining: 12500,
    status: 2,
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Briox)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('101')
    expect(result.invoiceNumber).toBe('INV-101')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
    expect(result.currency).toBe('SEK')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-30'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps numeric status 1 to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 1 })).status).toBe('DRAFT')
  })

  it('maps numeric status 2 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps numeric status 3 to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 3 })).status).toBe('PAID')
  })

  it('maps numeric status 4 to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 4 })).status).toBe('VOIDED')
  })

  it('maps string status authorized to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'authorized' })).status).toBe('AUTHORIZED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 5,
          description: 'Consulting',
          quantity: 3,
          unit_price: 1000,
          total: 3000,
          vat_amount: 750,
          account_number: '3001',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('5')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(3000)
    expect(li.taxAmount).toBe(750)
    expect(li.accountId).toBe('3001')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
