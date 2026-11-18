import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MeritaktivaInvoice } from '../../../../../../../src/verticals/accounting/adapters/meritaktiva/transform/invoice'

function makeInvoice(overrides: Partial<MeritaktivaInvoice> = {}): MeritaktivaInvoice {
  return {
    Id: '1',
    InvoiceNo: 'INV-001',
    DocumentDate: '2024-01-15',
    DueDate: '2024-02-15',
    TotalSum: 1200,
    TaxAmount: 200,
    Paid: false,
    CustomerId: 'C1',
    Currency: 'EUR',
    ...overrides,
  }
}

describe('transformInvoice (meritaktiva)', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('1')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-001')
  })

  it('maps total amount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1200)
  })

  it('maps tax amount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(200)
  })

  it('maps DRAFT status when not paid', () => {
    expect(transformInvoice(makeInvoice({ Paid: false })).status).toBe('DRAFT')
  })

  it('maps PAID status when paid is true', () => {
    expect(transformInvoice(makeInvoice({ Paid: true })).status).toBe('PAID')
  })

  it('maps contact id', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('C1')
  })

  it('maps dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
