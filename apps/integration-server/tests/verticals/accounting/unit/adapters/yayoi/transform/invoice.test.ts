import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformInvoice,
  untransformInvoice,
  type MisocaInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/yayoi/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<MisocaInvoice> = {}): MisocaInvoice {
  return {
    id: 123,
    invoice_number: 'INV-2026-001',
    subject: 'Services rendered',
    issue_date: '2026-02-01',
    payment_due_on: '2026-03-03',
    total_amount: 125000,
    tax_amount: 10000,
    contact_id: 42,
    invoice_status: 'submitted',
    payment_status: 'unpaid',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    items: [
      {
        id: 1,
        name: 'Consulting',
        quantity: 5,
        unit_price: 23000,
        price: 115000,
      },
    ],
    ...overrides,
  }
}

describe('transformInvoice (yayoi)', () => {
  it('maps id to string id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('123')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeRaw()).type).toBe('INVOICE')
  })

  it('maps invoice_status submitted to status AUTHORIZED', () => {
    expect(transformInvoice(makeRaw()).status).toBe('AUTHORIZED')
  })

  it('maps invoice_status trashed to status DELETED', () => {
    expect(transformInvoice(makeRaw({ invoice_status: 'trashed' })).status).toBe('DELETED')
  })

  it('maps payment_status paid to status PAID', () => {
    expect(
      transformInvoice(makeRaw({ invoice_status: 'submitted', payment_status: 'paid' })).status,
    ).toBe('PAID')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('INV-2026-001')
  })

  it('maps contact_id to contactId as string', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('42')
  })

  it('maps total_amount directly (not converted)', () => {
    // Misoca amounts are already canonical integers
    expect(transformInvoice(makeRaw()).totalAmount).toBe(125000)
  })

  it('maps subject to notes', () => {
    expect(transformInvoice(makeRaw()).notes).toBe('Services rendered')
  })

  it('maps issue_date to postedAt', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('maps payment_due_on to dueAt', () => {
    expect(transformInvoice(makeRaw()).dueAt).toBeInstanceOf(Date)
  })

  it('maps line item name to itemDescription', () => {
    const li = transformInvoice(makeRaw()).lineItems?.[0]
    expect(li?.itemDescription).toBe('Consulting')
  })

  it('maps line item price to totalAmount', () => {
    const li = transformInvoice(makeRaw()).lineItems?.[0]
    expect(li?.totalAmount).toBe(115000)
  })

  it('produces a schema-valid Invoice', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('maps contactId back to contact_id as number', () => {
      const result = untransformInvoice({ contactId: '42' })
      expect(result.contact_id).toBe(42)
    })

    it('maps invoiceNumber back to invoice_number', () => {
      const result = untransformInvoice({ invoiceNumber: 'INV-2026-001' })
      expect(result.invoice_number).toBe('INV-2026-001')
    })

    it('maps notes back to subject', () => {
      const result = untransformInvoice({ notes: 'Services rendered' })
      expect(result.subject).toBe('Services rendered')
    })

    it('formats postedAt as ISO date string for issue_date', () => {
      const result = untransformInvoice({ postedAt: new Date('2026-02-01T00:00:00.000Z') })
      expect(result.issue_date).toBe('2026-02-01')
    })
  })
})
