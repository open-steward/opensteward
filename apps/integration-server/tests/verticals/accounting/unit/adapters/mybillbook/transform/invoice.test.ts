import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type MybillbookInvoice,
  type MybillbookInvoiceItem,
} from '../../../../../../../src/verticals/accounting/adapters/mybillbook/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

const sampleItem: MybillbookInvoiceItem = {
  id: 'item-001',
  item_name: 'Consulting Services',
  description: 'Advisory fee',
  unit_price: 10000.0,
  quantity: 3,
  discount: 500.0,
  tax_amount: 4950.0,
  total_amount: 34450.0,
}

function makeRaw(overrides: Partial<MybillbookInvoice> = {}): MybillbookInvoice {
  return {
    id: 'inv-001',
    invoice_number: 'INV-2024-001',
    party_id: 'party-001',
    invoice_date: '2024-04-01',
    due_date: '2024-04-30',
    status: 'sent',
    currency: 'INR',
    total_amount: 34450.0,
    tax_amount: 4950.0,
    discount_amount: 500.0,
    paid_amount: 0,
    balance_amount: 34450.0,
    reference_number: 'REF-001',
    notes: 'Q1 consulting',
    items: [sampleItem],
    created_at: '2024-04-01T09:00:00.000Z',
    updated_at: '2024-04-01T09:30:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice (mybillbook)', () => {
  it('maps id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('inv-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeRaw()).type).toBe('INVOICE')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps party_id to contactId', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('party-001')
  })

  it('maps sent status to SUBMITTED', () => {
    expect(transformInvoice(makeRaw({ status: 'sent' })).status).toBe('SUBMITTED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps partially_paid status', () => {
    expect(transformInvoice(makeRaw({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps overdue status', () => {
    expect(transformInvoice(makeRaw({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('converts total_amount to minor units (34450.00 → 3445000)', () => {
    expect(transformInvoice(makeRaw()).totalAmount).toBe(3445000)
  })

  it('converts tax_amount to minor units (4950.00 → 495000)', () => {
    expect(transformInvoice(makeRaw()).taxAmount).toBe(495000)
  })

  it('maps reference_number to reference', () => {
    expect(transformInvoice(makeRaw()).reference).toBe('REF-001')
  })

  it('maps notes', () => {
    expect(transformInvoice(makeRaw()).notes).toBe('Q1 consulting')
  })

  it('maps lineitem item_name to itemName', () => {
    expect(transformInvoice(makeRaw()).lineItems![0].itemName).toBe('Consulting Services')
  })

  it('converts lineitem unit_price to minor units', () => {
    expect(transformInvoice(makeRaw()).lineItems![0].unitAmount).toBe(1000000)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })
})

describe('untransformInvoice (mybillbook)', () => {
  it('round-trips party_id / contactId', () => {
    const canonical = transformInvoice(makeRaw())
    const back = untransformInvoice(canonical)
    expect(back.party_id).toBe('party-001')
  })

  it('round-trips currency', () => {
    const canonical = transformInvoice(makeRaw())
    const back = untransformInvoice(canonical)
    expect(back.currency).toBe('INR')
  })

  it('round-trips reference_number', () => {
    const canonical = transformInvoice(makeRaw())
    const back = untransformInvoice(canonical)
    expect(back.reference_number).toBe('REF-001')
  })

  it('converts unit_price back from minor units to decimal (1000000 → 10000)', () => {
    const canonical = transformInvoice(makeRaw())
    const back = untransformInvoice(canonical)
    const items = back.items as Array<Record<string, unknown>>
    expect(items[0]?.unit_price).toBe(10000)
  })
})
