import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type TymsInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/tyms/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<TymsInvoice> = {}): TymsInvoice {
  return {
    uuid: 'inv-001',
    document_number: 'INV-2024-001',
    title: 'Invoice Title',
    date: '2024-03-15',
    due_date: '2024-04-15',
    amount: 12000,
    tax: 2000,
    balance: 12000,
    currency: 'USD',
    status: 'draft',
    customer: { uuid: 'cust-99', name: 'Acme Corp' },
    invoice_note: 'Thank you for your business',
    created_at: '2024-03-01T00:00:00.000Z',
    updated_at: '2024-03-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('cust-99')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(12000)
    expect(result.taxAmount).toBe(2000)
    expect(result.notes).toBe('Thank you for your business')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
    expect(result.createdAt).toEqual(new Date('2024-03-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-03-15T00:00:00.000Z'))
  })

  it('passes raw as metadata', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status=draft to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status=paid to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps status=voided to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'voided' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps status=cancelled to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps status=sent to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'sent' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('derives PAID from balance=0 when no status', () => {
    const result = transformInvoice(makeInvoice({ status: undefined, amount: 1000, balance: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('derives PARTIALLY_PAID from partial balance when no status', () => {
    const result = transformInvoice(makeInvoice({ status: undefined, amount: 1000, balance: 500 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('extracts tax from object form', () => {
    const result = transformInvoice(makeInvoice({ tax: { amount: 300 } }))
    expect(result.taxAmount).toBe(300)
  })

  it('maps lineItems correctly', () => {
    const raw = makeInvoice({
      items: [
        {
          uuid: 'li-1',
          name: 'Widget',
          description: 'A widget',
          price: 100,
          quantity: 5,
          amount: 500,
          tax: 50,
          account: 'SALES',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemName).toBe('Widget')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(500)
  })

  it('produces a schema-valid result', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformInvoice', () => {
    const canonical = transformInvoice(
      makeInvoice({
        customer: { uuid: 'cust-1' },
        invoice_note: 'Note',
        currency: 'EUR',
      }),
    )
    const body = untransformInvoice(canonical)
    expect(body['currency']).toBe('EUR')
    expect(body['invoice_note']).toBe('Note')
    expect((body['customer'] as Record<string, unknown>)['uuid']).toBe('cust-1')
  })
})
