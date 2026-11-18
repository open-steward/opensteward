import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type BlInvoice } from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/invoice'

function makeInvoice(overrides: Partial<BlInvoice> = {}): BlInvoice {
  return {
    Id: 'inv-uuid-1234',
    InvoiceNumber: 1042,
    CustomerId: 'cust-uuid-5678',
    Currency: 'SEK',
    InvoiceDate: '2024-03-15',
    DueDate: '2024-04-15',
    TotalAmount: 12500,
    VatAmount: 2500,
    RemainingAmount: 12500,
    PaidAmount: 0,
    Status: 'Sent',
    Lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-uuid-1234')
  })

  it('maps invoiceNumber as string', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.invoiceNumber).toBe('1042')
  })

  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.contactId).toBe('cust-uuid-5678')
    expect(result.currency).toBe('SEK')
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
    expect(result.paidAmount).toBe(0)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined for missing date fields', () => {
    const result = transformInvoice(makeInvoice({ InvoiceDate: '', DueDate: '' }))
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
  })

  it('maps Draft status', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Sent status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Sent' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid status', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps PartiallyPaid status', () => {
    const result = transformInvoice(makeInvoice({ Status: 'PartiallyPaid' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps Overdue status', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Overdue' }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps Cancelled status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ Status: 'Unknown' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps invoice lines to lineItems', () => {
    const raw = makeInvoice({
      Lines: [
        {
          Id: 'line-1',
          ArticleNumber: 'ART-001',
          Description: 'Consulting hours',
          Quantity: 10,
          UnitPrice: 1000,
          Amount: 10000,
          VatRate: 25,
          AccountNumber: 3010,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.itemId).toBe('ART-001')
    expect(li.itemDescription).toBe('Consulting hours')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(10000)
    expect(li.accountId).toBe('3010')
  })

  it('returns undefined for empty string fields', () => {
    const result = transformInvoice(makeInvoice({ CustomerId: '', Currency: '' }))
    expect(result.contactId).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
