import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FortnoxInvoice } from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/invoice'

function makeInvoice(overrides: Partial<FortnoxInvoice> = {}): FortnoxInvoice {
  return {
    DocumentNumber: '100',
    CustomerNumber: '1',
    CustomerName: 'Acme AB',
    InvoiceDate: '2024-01-15',
    DueDate: '2024-02-15',
    FinalPayDate: '',
    Total: 10000,
    TotalVAT: 2000,
    Balance: 10000,
    Currency: 'SEK',
    Booked: false,
    Cancelled: false,
    Sent: false,
    InvoiceRows: [],
    ExternalInvoiceReference1: '',
    ExternalInvoiceReference2: '',
    YourReference: '',
    OurReference: '',
    OCR: '',
    Project: '',
    CostCenter: '',
    TermsOfPayment: '30',
    WayOfDelivery: 'DIRECT',
    PaymentWay: '',
    PaidAmount: 0,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('100')
    expect(result.invoiceNumber).toBe('100')
    expect(result.contactId).toBe('cust_1')
    expect(result.totalAmount).toBe(1000000)
    expect(result.taxAmount).toBe(200000)
    expect(result.balanceAmount).toBe(1000000)
    expect(result.currency).toBe('SEK')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice({ OCR: '12345' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['OCR']).toBe('12345')
  })

  it('maps unbooked invoice to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ Booked: false, Cancelled: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps booked invoice with balance to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ Booked: true, Balance: 10000 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps booked invoice with zero balance to PAID', () => {
    const result = transformInvoice(makeInvoice({ Booked: true, Balance: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps booked invoice with partial balance to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeInvoice({ Booked: true, Balance: 5000, Total: 10000 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps cancelled invoice to VOIDED regardless of booked state', () => {
    const result = transformInvoice(makeInvoice({ Booked: true, Balance: 0, Cancelled: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps invoice rows to lineItems', () => {
    const raw = makeInvoice({
      InvoiceRows: [
        {
          RowId: 1,
          ArticleNumber: 'ART-001',
          Description: 'Widget',
          Price: 500,
          OrderedQuantity: 10,
          Total: 5000,
          VAT: 1000,
          AccountNumber: '3000',
          Discount: 0,
          Unit: 'st',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('ART-001')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(50000)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(500000)
    expect(li.taxAmount).toBe(100000)
    expect(li.accountId).toBe('3000')
  })

  it('maps ExternalInvoiceReference1 to reference', () => {
    const result = transformInvoice(makeInvoice({ ExternalInvoiceReference1: 'ERP-999' }))
    expect(result.reference).toBe('ERP-999')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
