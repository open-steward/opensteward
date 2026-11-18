import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ProsvasisInvoice } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/invoice'

function makeInvoice(overrides: Partial<ProsvasisInvoice> = {}): ProsvasisInvoice {
  return {
    id: '1001',
    SeriesNumber: 'INV-2024-001',
    Status: 'Draft',
    IssueDate: '2024-03-01',
    DueDate: '2024-03-31',
    TotalAmount: 1240,
    VatAmount: 240,
    Currency: 'EUR',
    CustomerId: '50',
    Lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('50')
    expect(result.totalAmount).toBe(1240)
    expect(result.taxAmount).toBe(240)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Issued to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Issued' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid to PAID', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps Cancelled to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps invoice lines to lineItems', () => {
    const raw = makeInvoice({
      Lines: [
        {
          Id: 10,
          Description: 'Service',
          Quantity: 2,
          UnitPrice: 500,
          TotalAmount: 1000,
          VatAmount: 240,
          AccountCode: '7000',
          Discount: 0,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemDescription).toBe('Service')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(240)
    expect(li.accountId).toBe('7000')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
