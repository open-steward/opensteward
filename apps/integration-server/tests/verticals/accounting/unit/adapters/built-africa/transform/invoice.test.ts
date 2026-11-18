import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type BuiltAfricaInvoice,
  type BuiltAfricaInvoiceItem,
} from '../../../../../../../src/verticals/accounting/adapters/built-africa/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoiceItem(overrides: Partial<BuiltAfricaInvoiceItem> = {}): BuiltAfricaInvoiceItem {
  return {
    id: 1,
    invoice_id: 100,
    description: 'Widget Pro',
    quantity: 2,
    unit_price: 50.0,
    amount: 100.0,
    tax_amount: 10.0,
    discount_amount: 5.0,
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<BuiltAfricaInvoice> = {}): BuiltAfricaInvoice {
  return {
    id: 100,
    invoice_number: 'INV-100',
    customer_id: 5,
    start_date: '2024-02-01',
    end_date: '2024-03-01',
    gross_amount: 200.0,
    discount_amount: 5.0,
    amount_due: 195.0,
    amount_paid: 100.0,
    balance: 95.0,
    paid_status: 'partial',
    base_currency: 'USD',
    note: 'Thank you',
    items: [],
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-02-01T14:20:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id to string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('100')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-100')
  })

  it('maps customer_id to contactId with cust_ prefix', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust_5')
  })

  it('returns undefined contactId when customer_id is absent', () => {
    expect(transformInvoice(makeInvoice({ customer_id: undefined })).contactId).toBeUndefined()
  })

  it('maps base_currency to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('falls back to fx_currency when base_currency absent', () => {
    expect(
      transformInvoice(makeInvoice({ base_currency: undefined, fx_currency: 'GHS' })).currency,
    ).toBe('GHS')
  })

  it('maps gross_amount to totalAmount in minor units', () => {
    expect(transformInvoice(makeInvoice({ gross_amount: 200.0 })).totalAmount).toBe(20000)
  })

  it('maps discount_amount to discountAmount in minor units', () => {
    expect(transformInvoice(makeInvoice({ discount_amount: 5.0 })).discountAmount).toBe(500)
  })

  it('maps amount_paid to paidAmount in minor units', () => {
    expect(transformInvoice(makeInvoice({ amount_paid: 100.0 })).paidAmount).toBe(10000)
  })

  it('maps balance to balanceAmount in minor units', () => {
    expect(transformInvoice(makeInvoice({ balance: 95.0 })).balanceAmount).toBe(9500)
  })

  it('maps note to notes', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('Thank you')
  })

  it('maps paid_status paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ paid_status: 'paid' })).status).toBe('PAID')
  })

  it('maps paid_status partial to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ paid_status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps paid_status overdue to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ paid_status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps unknown paid_status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ paid_status: 'unpaid' })).status).toBe('AUTHORIZED')
  })

  it('maps deleted_at to VOIDED status', () => {
    expect(transformInvoice(makeInvoice({ deleted_at: '2024-04-01T00:00:00Z' })).status).toBe(
      'VOIDED',
    )
  })

  it('maps start_date to postedAt as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps end_date to dueAt as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('returns undefined postedAt when start_date is absent', () => {
    expect(transformInvoice(makeInvoice({ start_date: undefined })).postedAt).toBeUndefined()
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformInvoice(makeInvoice()).createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformInvoice(makeInvoice()).updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('maps items to lineItems', () => {
    const raw = makeInvoice({ items: [makeInvoiceItem()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Widget Pro')
    expect(li.unitAmount).toBe(5000)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(10000)
    expect(li.taxAmount).toBe(1000)
    expect(li.discountAmount).toBe(500)
  })

  it('handles empty items array', () => {
    expect(transformInvoice(makeInvoice({ items: [] })).lineItems).toEqual([])
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })
})

describe('untransformInvoice', () => {
  it('converts cust_ prefixed contactId to customer_id number', () => {
    const result = untransformInvoice({ contactId: 'cust_5' })
    expect(result.customer_id).toBe(5)
  })

  it('converts unprefixed contactId to customer_id number', () => {
    const result = untransformInvoice({ contactId: '42' })
    expect(result.customer_id).toBe(42)
  })

  it('returns undefined customer_id when contactId is absent', () => {
    const result = untransformInvoice({})
    expect(result.customer_id).toBeUndefined()
  })

  it('converts totalAmount minor units to gross_amount decimal', () => {
    const result = untransformInvoice({ totalAmount: 20000 })
    expect(result.gross_amount).toBe(200)
    expect(result.amount_due).toBe(200)
  })

  it('converts postedAt to start_date YYYY-MM-DD string', () => {
    const result = untransformInvoice({ postedAt: new Date('2024-02-01') })
    expect(result.start_date).toBe('2024-02-01')
  })

  it('converts dueAt to end_date YYYY-MM-DD string', () => {
    const result = untransformInvoice({ dueAt: new Date('2024-03-01') })
    expect(result.end_date).toBe('2024-03-01')
  })

  it('maps notes to note', () => {
    const result = untransformInvoice({ notes: 'Thank you' })
    expect(result.note).toBe('Thank you')
  })

  it('maps lineItems to items array with decimal values', () => {
    const result = untransformInvoice({
      lineItems: [
        { itemDescription: 'Widget Pro', unitQuantity: 2, unitAmount: 5000, totalAmount: 10000 },
      ],
    })
    expect(result.items).toHaveLength(1)
    const item = (result.items as Array<Record<string, unknown>>)[0]
    expect(item.description).toBe('Widget Pro')
    expect(item.quantity).toBe(2)
    expect(item.unit_price).toBe(50)
    expect(item.amount).toBe(100)
  })

  it('round-trips: transform then untransform preserves key fields', () => {
    const raw = makeInvoice()
    const canonical = transformInvoice(raw)
    const body = untransformInvoice(canonical)
    expect(body.customer_id).toBe(5)
    expect(body.gross_amount).toBe(200)
    expect(body.start_date).toBe('2024-02-01')
    expect(body.end_date).toBe('2024-03-01')
  })
})
