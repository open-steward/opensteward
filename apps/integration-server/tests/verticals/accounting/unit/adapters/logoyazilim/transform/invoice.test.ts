import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type LogoInvoice } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/invoice'

function makeInvoice(overrides: Partial<LogoInvoice> = {}): LogoInvoice {
  return {
    id: '1001',
    InvoiceNumber: 'INV-2024-001',
    InvoiceDate: '2024-01-15',
    DueDate: '2024-02-15',
    TotalAmount: 11800,
    TaxAmount: 1800,
    Status: 'Draft',
    CurrencyCode: 'TRY',
    CustomerId: '42',
    ...overrides,
  }
}

describe('transformInvoice (logoyazilim)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.totalAmount).toBe(11800)
    expect(result.taxAmount).toBe(1800)
    expect(result.currency).toBe('TRY')
    expect(result.contactId).toBe('42')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ Status: 'Unknown' })).status).toBe('DRAFT')
  })

  it('handles missing optional fields gracefully', () => {
    const raw: LogoInvoice = { id: '9999' }
    const result = transformInvoice(raw)
    expect(result.id).toBe('9999')
    expect(result.invoiceNumber).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
