import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type DaftraInvoice } from '../../../../../../../src/verticals/accounting/adapters/daftra/transform/invoice'

function makeRaw(overrides: Partial<DaftraInvoice> = {}): DaftraInvoice {
  return {
    id: '10',
    no: 'INV-2024-001',
    date: '2024-03-01',
    due_date: '2024-03-31',
    summary_subtotal: 2000,
    summary_tax1: 100,
    summary_total: 2100,
    summary_paid: 0,
    summary_unpaid: 2100,
    payment_status: 'unpaid',
    client_id: 'client1',
    currency_code: 'EGP',
    InvoiceProducts: [],
    ...overrides,
  }
}

describe('transformInvoice (daftra)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('10')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.totalAmount).toBe(2100)
    expect(result.taxAmount).toBe(100)
    expect(result.currency).toBe('EGP')
    expect(result.type).toBe('INVOICE')
    expect(result.contactId).toBe('client1')
    expect(result.paidAmount).toBe(0)
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

  it('maps draft=1 to DRAFT', () => {
    expect(transformInvoice(makeRaw({ draft: 1 })).status).toBe('DRAFT')
  })

  it('maps unpaid payment_status to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ draft: 0, payment_status: 'unpaid' })).status).toBe('AUTHORIZED')
  })

  it('maps paid payment_status to PAID', () => {
    expect(transformInvoice(makeRaw({ draft: 0, payment_status: 'paid' })).status).toBe('PAID')
  })

  it('maps voided payment_status to VOIDED', () => {
    expect(transformInvoice(makeRaw({ draft: 0, payment_status: 'voided' })).status).toBe('VOIDED')
  })

  it('defaults to AUTHORIZED when payment_status is not recognized', () => {
    expect(transformInvoice(makeRaw({ draft: 0, payment_status: 'partial' })).status).toBe('AUTHORIZED')
  })

  it('accepts string draft value', () => {
    expect(transformInvoice(makeRaw({ draft: '1' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      InvoiceProducts: [
        {
          product_id: 'prod1',
          product_description: 'Consulting',
          unit: 5,
          price: 400,
          total: 2000,
          tax: 15,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('prod1')
    expect(result.lineItems![0].itemDescription).toBe('Consulting')
    expect(result.lineItems![0].unitQuantity).toBe(5)
    expect(result.lineItems![0].unitAmount).toBe(400)
    expect(result.lineItems![0].totalAmount).toBe(2000)
    expect(result.lineItems![0].taxAmount).toBe(15)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformInvoice({ id: '99' })
    expect(result.id).toBe('99')
    expect(result.invoiceNumber).toBeUndefined()
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
