import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FoundationInvoice } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/invoice'

function makeInvoice(overrides: Partial<FoundationInvoice> = {}): FoundationInvoice {
  return {
    InvoiceNumber: 'INV-001',
    JobNumber: 'JOB-100',
    VendorId: 'VEND-42',
    InvoiceDate: '2024-03-01',
    DueDate: '2024-03-31',
    Amount: 1500,
    TaxAmount: 150,
    Balance: 1500,
    Currency: 'USD',
    Status: 'Draft',
    Lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('INV-001')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('VEND-42')
    expect(result.totalAmount).toBe(1500)
    expect(result.taxAmount).toBe(150)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Approved' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps Void status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Void' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps invoice lines to lineItems', () => {
    const raw = makeInvoice({
      Lines: [
        {
          LineId: 1,
          Description: 'Labor',
          Quantity: 10,
          UnitPrice: 100,
          TotalAmount: 1000,
          TaxAmount: 100,
          AccountNumber: '5000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Labor')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(100)
    expect(li.accountId).toBe('5000')
  })

  it('returns empty lineItems array when Lines is absent', () => {
    const raw = makeInvoice({ Lines: [] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
