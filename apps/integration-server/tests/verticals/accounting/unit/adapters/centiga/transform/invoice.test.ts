import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type CentigaInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/centiga/transform/invoice'

function makeInvoice(overrides: Partial<CentigaInvoice> = {}): CentigaInvoice {
  return {
    id: 'inv-001',
    number: 'INV-001',
    date: '2024-03-01',
    due_date: '2024-03-31',
    net_amount: 10000,
    tax_amount: 2500,
    total_amount: 12500,
    unpaid: 12500,
    status: 'open',
    currency: 'NOK',
    customer_id: 'cust-1',
    ...overrides,
  }
}

describe('transformInvoice (Centiga)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('cust-1')
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
    expect(result.currency).toBe('NOK')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps open status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeInvoice({
      line_items: [
        {
          id: 'li-1',
          description: 'Consulting',
          quantity: 5,
          unit_price: 1000,
          total: 5000,
          vat_amount: 1250,
          account_id: '3001',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(5000)
    expect(li.accountId).toBe('3001')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
