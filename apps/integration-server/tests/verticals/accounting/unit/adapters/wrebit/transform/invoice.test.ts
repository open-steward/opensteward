import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type WrebitInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/wrebit/transform/invoice'

function makeInvoice(overrides: Partial<WrebitInvoice> = {}): WrebitInvoice {
  return {
    id: 401,
    ref: 'WR-001',
    date: '2024-07-01',
    due_date: '2024-07-31',
    net_amount: 10000,
    vat_amount: 2500,
    gross_amount: 12500,
    outstanding: 12500,
    status: 'open',
    contact_id: 99,
    currency: 'SEK',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Wrebit)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('401')
    expect(result.invoiceNumber).toBe('WR-001')
    expect(result.contactId).toBe('99')
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
    expect(result.currency).toBe('SEK')
    expect(result.type).toBe('INVOICE')
  })

  it('maps ref to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice({ ref: 'WR-999' })).invoiceNumber).toBe('WR-999')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-07-01'))
    expect(result.dueAt).toEqual(new Date('2024-07-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps open status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps settled status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'settled' })).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 9,
          description: 'Product A',
          quantity: 10,
          unit_price: 100,
          total: 1000,
          vat: 250,
          account: '4000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('9')
    expect(li.itemDescription).toBe('Product A')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(250)
    expect(li.accountId).toBe('4000')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
