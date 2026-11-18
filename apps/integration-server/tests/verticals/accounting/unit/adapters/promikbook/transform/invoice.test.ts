import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type PromikBookInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/promikbook/transform/invoice'

function makeInvoice(overrides: Partial<PromikBookInvoice> = {}): PromikBookInvoice {
  return {
    id: 101,
    invoice_no: 'PB-001',
    date: '2024-04-01',
    due_date: '2024-04-30',
    amount_excl_vat: 10000,
    vat_amount: 2500,
    amount_incl_vat: 12500,
    unpaid: 12500,
    status: 'active',
    contact_id: 55,
    currency: 'SEK',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (PromikBook)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('101')
    expect(result.invoiceNumber).toBe('PB-001')
    expect(result.contactId).toBe('55')
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

  it('maps active status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'active' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 1,
          description: 'Service fee',
          quantity: 2,
          unit_price: 500,
          total: 1000,
          vat: 250,
          account_no: '3001',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Service fee')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(250)
    expect(li.accountId).toBe('3001')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
