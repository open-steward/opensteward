import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type VismaCustomerInvoice } from '../../../../../../../src/verticals/accounting/adapters/visma/transform/invoice'

function makeInvoice(overrides: Partial<VismaCustomerInvoice> = {}): VismaCustomerInvoice {
  return {
    Id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    CustomerId: 'cust-uuid-1234',
    CustomerNumber: '1001',
    InvoiceDate: '2024-03-15',
    DueDate: '2024-04-15',
    TotalAmount: 12500,
    TotalVatAmount: 2500,
    RemainingAmount: 12500,
    InvoiceCurrencyCode: 'SEK',
    IsCreditInvoice: false,
    InvoiceNumber: 1042,
    YourReference: 'PO-2024-001',
    OurReference: 'John Doe',
    Rows: [],
    CreatedUtc: '2024-03-15T10:00:00Z',
    ModifiedUtc: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    expect(result.invoiceNumber).toBe('1042')
    expect(result.contactId).toBe('cust-uuid-1234')
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
    expect(result.currency).toBe('SEK')
    expect(result.type).toBe('INVOICE')
    expect(result.reference).toBe('PO-2024-001')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice({ OurReference: 'REF-123' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['OurReference']).toBe('REF-123')
  })

  it('maps invoice with remaining amount to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ InvoiceNumber: 1042, RemainingAmount: 12500 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps invoice with zero remaining to PAID', () => {
    const result = transformInvoice(makeInvoice({ RemainingAmount: 0, TotalAmount: 12500 }))
    expect(result.status).toBe('PAID')
  })

  it('maps invoice with partial remaining to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeInvoice({ RemainingAmount: 5000, TotalAmount: 12500 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps credit invoice to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ IsCreditInvoice: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps invoice rows to lineItems', () => {
    const raw = makeInvoice({
      Rows: [
        {
          LineNumber: 1,
          ArticleId: 'art-uuid-1',
          ArticleNumber: 'ART-001',
          Text: 'Consulting hours',
          UnitPrice: 1000,
          Quantity: 10,
          DiscountPercentage: 0,
          TotalAmount: 10000,
          TotalVatAmount: 2500,
          CostCenterItemId1: '',
          ProjectId: '',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('art-uuid-1')
    expect(li.itemDescription).toBe('Consulting hours')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(10000)
    expect(li.taxAmount).toBe(2500)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
