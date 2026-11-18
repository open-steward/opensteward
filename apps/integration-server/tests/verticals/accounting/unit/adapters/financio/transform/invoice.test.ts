import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FinancioInvoice } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/invoice'

function makeRaw(overrides: Partial<FinancioInvoice> = {}): FinancioInvoice {
  return {
    id: '200',
    invoice_no: 'INV-2024-001',
    invoice_date: '2024-03-01',
    due_date: '2024-03-31',
    sub_total: 1000,
    tax_total: 60,
    grand_total: 1060,
    outstanding: 1060,
    currency_code: 'SGD',
    customer_id: '10',
    customer_name: 'Acme Pte Ltd',
    status: 0,
    items: [],
    ...overrides,
  }
}

describe('transformInvoice (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('200')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('10')
    expect(result.totalAmount).toBe(1060)
    expect(result.taxAmount).toBe(60)
    expect(result.balanceAmount).toBe(1060)
    expect(result.currency).toBe('SGD')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ invoice_no: 'INV-SPECIAL' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['invoice_no']).toBe('INV-SPECIAL')
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps status 2 to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 2 })).status).toBe('PAID')
  })

  it('maps status 3 to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 3 })).status).toBe('VOIDED')
  })

  it('maps items to lineItems', () => {
    const raw = makeRaw({
      items: [
        {
          id: '1',
          description: 'Consulting',
          qty: 2,
          unit_price: 500,
          amount: 1000,
          tax_amount: 60,
          account_code: '4-001',
          tax_rate: 6,
          discount_amount: 0,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(60)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
