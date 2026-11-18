import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type QoyodInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<QoyodInvoice> = {}): QoyodInvoice {
  return {
    id: 700,
    reference: 'INV-2025-007',
    customer_id: 300,
    customer_name: 'Customer Corp',
    date: '2025-06-01',
    due_date: '2025-07-01',
    status: 'sent',
    notes: 'Consulting project invoice',
    currency: 'SAR',
    subtotal: 2000,
    tax_total: 300,
    discount_total: 0,
    total: 2300,
    paid_amount: 0,
    balance: 2300,
    line_items: [
      {
        id: 5,
        product_id: 12,
        description: 'Consulting hours',
        quantity: 20,
        unit_price: 100,
        tax_amount: 300,
        total: 2300,
        discount: 0,
        account_id: 50,
      },
    ],
    ...overrides,
  }
}

describe('qoyod transformInvoice', () => {
  it('maps numeric id to string', () => {
    expect(transformInvoice(makeRaw()).id).toBe('700')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeRaw()).type).toBe('INVOICE')
  })

  it('maps sent status to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps overdue status to OVERDUE', () => {
    expect(transformInvoice(makeRaw({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps voided status to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps reference to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('INV-2025-007')
  })

  it('falls back to String(id) as invoiceNumber when reference absent', () => {
    expect(transformInvoice(makeRaw({ reference: null })).invoiceNumber).toBe('700')
  })

  it('maps customer_id to contactId as string', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('300')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeRaw()).currency).toBe('SAR')
  })

  it('maps total directly (no ×100 conversion)', () => {
    expect(transformInvoice(makeRaw()).totalAmount).toBe(2300)
  })

  it('maps tax_total to taxAmount', () => {
    expect(transformInvoice(makeRaw()).taxAmount).toBe(300)
  })

  it('maps discount_total to discountAmount', () => {
    expect(transformInvoice(makeRaw()).discountAmount).toBe(0)
  })

  it('maps date to postedAt Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('maps line id to string', () => {
    expect(transformInvoice(makeRaw()).lineItems?.[0]?.id).toBe('5')
  })

  it('maps line product_id to itemId as string', () => {
    expect(transformInvoice(makeRaw()).lineItems?.[0]?.itemId).toBe('12')
  })

  it('passes InvoiceSchema.parse', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })
})

describe('qoyod untransformInvoice round-trip', () => {
  it('maps contactId back to numeric customer_id', () => {
    const inv = transformInvoice(makeRaw())
    const raw = untransformInvoice(inv)
    expect(raw['customer_id']).toBe(300)
  })

  it('maps reference back', () => {
    const inv = transformInvoice(makeRaw())
    const raw = untransformInvoice(inv)
    expect(raw['reference']).toBe('INV-2025-007')
  })

  it('maps notes back', () => {
    const inv = transformInvoice(makeRaw())
    const raw = untransformInvoice(inv)
    expect(raw['notes']).toBe('Consulting project invoice')
  })

  it('maps currency back', () => {
    const inv = transformInvoice(makeRaw())
    const raw = untransformInvoice(inv)
    expect(raw['currency']).toBe('SAR')
  })

  it('maps line items back', () => {
    const inv = transformInvoice(makeRaw())
    const raw = untransformInvoice(inv)
    const lines = raw['line_items'] as Array<Record<string, unknown>>
    expect(lines).toHaveLength(1)
    expect(lines[0]?.['description']).toBe('Consulting hours')
  })
})
