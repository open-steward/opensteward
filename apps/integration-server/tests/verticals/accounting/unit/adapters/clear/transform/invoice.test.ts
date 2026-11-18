import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type ClearInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/invoice'

function makeRaw(overrides: Partial<ClearInvoice> = {}): ClearInvoice {
  return {
    id: 'inv-uuid-001',
    invoice_number: 'INV/2024/001',
    invoice_date: '2024-03-01',
    due_date: '2024-03-31',
    total_taxable_value: 10000,
    total_tax_amount: 1800,
    grand_total: 11800,
    balance_amount: 11800,
    currency: 'INR',
    buyer_id: 'contact-uuid-001',
    buyer_name: 'Acme Pvt Ltd',
    place_of_supply: 'KA',
    status: 'pending',
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (clear)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('inv-uuid-001')
    expect(result.invoiceNumber).toBe('INV/2024/001')
    expect(result.contactId).toBe('contact-uuid-001')
    expect(result.currency).toBe('INR')
    expect(result.totalAmount).toBe(11800)
    expect(result.taxAmount).toBe(1800)
    expect(result.balanceAmount).toBe(11800)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformInvoice(makeRaw({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps pending status to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ status: 'pending' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps partial status to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeRaw({ status: 'partial' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps paid status to PAID', () => {
    const result = transformInvoice(makeRaw({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformInvoice(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps line items with combined tax amounts', () => {
    const raw = makeRaw({
      line_items: [
        {
          id: 'li-001',
          description: 'Software License',
          hsn_code: '998314',
          quantity: 1,
          unit_price: 10000,
          taxable_value: 10000,
          cgst_rate: 9,
          cgst_amount: 900,
          sgst_rate: 9,
          sgst_amount: 900,
          igst_rate: 0,
          igst_amount: 0,
          cess_amount: 0,
          total_amount: 11800,
          account_id: 'acc-001',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-001')
    expect(li.itemDescription).toBe('Software License')
    expect(li.unitAmount).toBe(10000)
    expect(li.unitQuantity).toBe(1)
    expect(li.totalAmount).toBe(11800)
    expect(li.taxAmount).toBe(1800)
    expect(li.accountId).toBe('acc-001')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
