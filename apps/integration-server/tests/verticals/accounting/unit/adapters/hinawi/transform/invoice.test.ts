import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type HinawiInvoice } from '../../../../../../../src/verticals/accounting/adapters/hinawi/transform/invoice'

function makeRaw(overrides: Partial<HinawiInvoice> = {}): HinawiInvoice {
  return {
    id: '1',
    InvoiceNo: 'INV-001',
    InvoiceDate: '2024-03-01',
    DueDate: '2024-03-31',
    SubTotal: 1000,
    TaxAmount: 50,
    Total: 1050,
    Balance: 1050,
    Status: 'Draft',
    CustomerId: 'c1',
    Currency: 'AED',
    LineItems: [],
    ...overrides,
  }
}

describe('transformInvoice (hinawi)', () => {
  it('maps core fields', () => {
    const r = transformInvoice(makeRaw())
    expect(r.id).toBe('1')
    expect(r.invoiceNumber).toBe('INV-001')
    expect(r.contactId).toBe('c1')
    expect(r.totalAmount).toBe(1050)
    expect(r.taxAmount).toBe(50)
    expect(r.currency).toBe('AED')
    expect(r.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const r = transformInvoice(makeRaw())
    expect(r.postedAt).toEqual(new Date('2024-03-01'))
    expect(r.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps Draft to DRAFT', () => { expect(transformInvoice(makeRaw({ Status: 'Draft' })).status).toBe('DRAFT') })
  it('maps Open to AUTHORIZED', () => { expect(transformInvoice(makeRaw({ Status: 'Open' })).status).toBe('AUTHORIZED') })
  it('maps Paid to PAID', () => { expect(transformInvoice(makeRaw({ Status: 'Paid' })).status).toBe('PAID') })
  it('maps Void to VOIDED', () => { expect(transformInvoice(makeRaw({ Status: 'Void' })).status).toBe('VOIDED') })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
