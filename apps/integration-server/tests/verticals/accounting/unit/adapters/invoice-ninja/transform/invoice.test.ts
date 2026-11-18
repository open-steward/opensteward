import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type InvoiceNinjaInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/invoice-ninja/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<InvoiceNinjaInvoice> = {}): InvoiceNinjaInvoice {
  return {
    id: 'inv-1',
    status_id: 2,
    number: 'INV-001',
    client_id: 'client-42',
    amount: 10000,
    balance: 10000,
    paid_to_date: 0,
    tax_amount: 1000,
    discount: 200,
    currency_id: '1', // USD
    date: '2024-01-15',
    due_date: '2024-02-15',
    po_number: 'PO-999',
    public_notes: 'Thank you for your business',
    line_items: [
      {
        product_key: 'SVC-001',
        notes: 'Consulting services',
        cost: 1000,
        quantity: 10,
        tax_rate1: 10,
        discount: 200,
        line_total: 9800,
      },
    ],
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-1')
  })

  it('always sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps status_id=1 to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status_id: 1 })).status).toBe('DRAFT')
  })

  it('maps status_id=2 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status_id: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps status_id=3 to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status_id: 3 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status_id=4 to PAID', () => {
    expect(transformInvoice(makeInvoice({ status_id: 4 })).status).toBe('PAID')
  })

  it('maps status_id=5 to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status_id: 5 })).status).toBe('VOIDED')
  })

  it('maps status_id=6 to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status_id: 6 })).status).toBe('VOIDED')
  })

  it('defaults to DRAFT for unknown status_id', () => {
    expect(transformInvoice(makeInvoice({ status_id: 99 })).status).toBe('DRAFT')
  })

  it('maps invoiceNumber from number', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-001')
  })

  it('maps contactId from client_id', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('client-42')
  })

  it('maps currency_id=1 to USD', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('maps totalAmount, taxAmount, discountAmount', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.totalAmount).toBe(10000)
    expect(result.taxAmount).toBe(1000)
    expect(result.discountAmount).toBe(200)
  })

  it('maps balanceAmount from balance', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(10000)
  })

  it('maps reference from po_number', () => {
    expect(transformInvoice(makeInvoice()).reference).toBe('PO-999')
  })

  it('maps notes from public_notes', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('Thank you for your business')
  })

  it('maps line items', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('SVC-001')
    expect(li.itemDescription).toBe('Consulting services')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(9800)
  })

  it('rounds fractional line item quantities', () => {
    const result = transformInvoice(
      makeInvoice({
        line_items: [{ product_key: 'X', quantity: 2.7, line_total: 270 }],
      }),
    )
    expect(result.lineItems![0].unitQuantity).toBe(3)
  })

  it('returns empty lineItems when line_items is null', () => {
    const result = transformInvoice(makeInvoice({ line_items: null }))
    expect(result.lineItems).toEqual([])
  })

  it('maps postedAt from date string', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps dueAt from due_date string', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-02-15'))
  })

  it('maps createdAt from epoch (×1000)', () => {
    expect(transformInvoice(makeInvoice()).createdAt).toEqual(new Date(1700000000 * 1000))
  })

  it('maps updatedAt from epoch (×1000)', () => {
    expect(transformInvoice(makeInvoice()).updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('passes InvoiceSchema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })
})
