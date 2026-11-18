import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FreeeInvoice } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/invoice'

function makeRaw(overrides: Partial<FreeeInvoice> = {}): FreeeInvoice {
  return {
    id: 1001,
    invoice_number: 'INV-001',
    issue_date: '2024-03-01',
    due_date: '2024-03-31',
    total_amount_with_vat: 11000,
    total_vat_amount: 1000,
    payment_status: 'empty',
    partner_id: 42,
    partner_name: 'Acme Corp',
    invoice_contents: [],
    ...overrides,
  }
}

describe('transformInvoice (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('1001')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(11000)
    expect(result.taxAmount).toBe(1000)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ invoice_number: 'INV-METADATA' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['invoice_number']).toBe('INV-METADATA')
  })

  it('maps empty payment_status to DRAFT', () => {
    const result = transformInvoice(makeRaw({ payment_status: 'empty' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps issue_date_not_arrived payment_status to DRAFT', () => {
    const result = transformInvoice(makeRaw({ payment_status: 'issue_date_not_arrived' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps unsettled payment_status to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ payment_status: 'unsettled' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps settled payment_status to PAID', () => {
    const result = transformInvoice(makeRaw({ payment_status: 'settled' }))
    expect(result.status).toBe('PAID')
  })

  it('maps invoice_contents to lineItems', () => {
    const raw = makeRaw({
      invoice_contents: [
        {
          id: 1,
          name: 'Service A',
          quantity: 2,
          unit_price: 5000,
          amount: 10000,
          vat_rate: 10,
          account_item_id: 100,
          account_item_name: 'Sales',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Service A')
    expect(li.unitAmount).toBe(5000)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(10000)
    expect(li.accountId).toBe('100')
  })

  it('computes balance as total minus vat', () => {
    const result = transformInvoice(makeRaw({ total_amount_with_vat: 11000, total_vat_amount: 1000 }))
    expect(result.balanceAmount).toBe(10000)
  })

  it('returns undefined contactId when partner_id is null', () => {
    const result = transformInvoice(makeRaw({ partner_id: null }))
    expect(result.contactId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
