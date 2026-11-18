import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ManagerioInvoice } from '../../../../../../../src/verticals/accounting/adapters/managerio/transform/invoice'

function makeRaw(overrides: Partial<ManagerioInvoice> = {}): ManagerioInvoice {
  return {
    Key: 'key-001',
    Reference: 'INV-001',
    Date: '2024-03-01',
    DueDate: '2024-03-31',
    Lines: [],
    Total: 1050,
    TotalTax: 50,
    AmountDue: 1050,
    Contact: 'contact-001',
    Currency: 'AED',
    Status: 'Draft',
    ...overrides,
  }
}

describe('transformInvoice (managerio)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('key-001')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('contact-001')
    expect(result.totalAmount).toBe(1050)
    expect(result.taxAmount).toBe(50)
    expect(result.currency).toBe('AED')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps Draft to DRAFT', () => { expect(transformInvoice(makeRaw({ Status: 'Draft' })).status).toBe('DRAFT') })
  it('maps Unpaid to AUTHORIZED', () => { expect(transformInvoice(makeRaw({ Status: 'Unpaid' })).status).toBe('AUTHORIZED') })
  it('maps Paid to PAID', () => { expect(transformInvoice(makeRaw({ Status: 'Paid' })).status).toBe('PAID') })
  it('maps Voided to VOIDED', () => { expect(transformInvoice(makeRaw({ Status: 'Voided' })).status).toBe('VOIDED') })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
