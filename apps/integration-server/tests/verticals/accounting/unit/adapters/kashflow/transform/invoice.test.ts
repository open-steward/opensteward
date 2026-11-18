import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type KashflowInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/kashflow/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<KashflowInvoice> = {}): KashflowInvoice {
  return {
    Number: 1001,
    Id: 10010,
    CustomerCode: 'CUST001',
    CustomerReference: 'PO-2024-001',
    IssuedDate: '2024-02-01',
    DueDate: '2024-03-01',
    GrossAmount: 120,
    NetAmount: 100,
    VATAmount: 20,
    TotalPaidAmount: 0,
    Status: 'Unpaid',
    Currency: { Code: 'GBP' },
    LineItems: [],
    Permalink: 'https://kashflow.example/invoices/1001',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps Number to id when present', () => {
    expect(transformInvoice(makeInvoice({ Number: 1001 })).id).toBe('1001')
  })

  it('falls back to String(Id) when Number is absent', () => {
    expect(transformInvoice(makeInvoice({ Number: undefined, Id: 10010 })).id).toBe('10010')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps Number to invoiceNumber when present', () => {
    expect(transformInvoice(makeInvoice({ Number: 1001 })).invoiceNumber).toBe('1001')
  })

  it('leaves invoiceNumber undefined when Number is absent', () => {
    expect(transformInvoice(makeInvoice({ Number: undefined })).invoiceNumber).toBeUndefined()
  })

  it('maps CustomerCode to contactId', () => {
    expect(transformInvoice(makeInvoice({ CustomerCode: 'CUST001' })).contactId).toBe('CUST001')
  })

  it('maps CustomerReference to reference', () => {
    expect(transformInvoice(makeInvoice({ CustomerReference: 'PO-2024-001' })).reference).toBe(
      'PO-2024-001',
    )
  })

  it('maps Currency.Code to currency', () => {
    expect(transformInvoice(makeInvoice({ Currency: { Code: 'GBP' } })).currency).toBe('GBP')
  })

  it('converts GrossAmount decimal pounds to minor units', () => {
    expect(transformInvoice(makeInvoice({ GrossAmount: 120 })).totalAmount).toBe(12000)
  })

  it('converts VATAmount decimal pounds to minor units', () => {
    expect(transformInvoice(makeInvoice({ VATAmount: 20 })).taxAmount).toBe(2000)
  })

  it('converts TotalPaidAmount decimal pounds to minor units', () => {
    expect(transformInvoice(makeInvoice({ TotalPaidAmount: 60 })).paidAmount).toBe(6000)
  })

  it('computes balanceAmount as totalAmount minus paidAmount', () => {
    const result = transformInvoice(makeInvoice({ GrossAmount: 120, TotalPaidAmount: 60 }))
    expect(result.balanceAmount).toBe(6000)
  })

  it('maps Permalink to url', () => {
    const result = transformInvoice(
      makeInvoice({ Permalink: 'https://kashflow.example/invoices/1001' }),
    )
    expect(result.url).toBe('https://kashflow.example/invoices/1001')
  })

  it('maps status PAID when Status is "paid"', () => {
    expect(transformInvoice(makeInvoice({ Status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PAID when Status is "overpaid"', () => {
    expect(transformInvoice(makeInvoice({ Status: 'overpaid' })).status).toBe('PAID')
  })

  it('maps status OVERDUE when Status is "overdue"', () => {
    expect(transformInvoice(makeInvoice({ Status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps status AUTHORIZED when Status is "unpaid" with no payment', () => {
    const result = transformInvoice(
      makeInvoice({ Status: 'Unpaid', GrossAmount: 120, TotalPaidAmount: 0 }),
    )
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status PARTIALLY_PAID when Status is "unpaid" and partial payment made', () => {
    // PARTIALLY_PAID: Status=unpaid, TotalPaidAmount > 0, TotalPaidAmount < GrossAmount
    const result = transformInvoice(
      makeInvoice({ Status: 'Unpaid', GrossAmount: 120, TotalPaidAmount: 60 }),
    )
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps status DRAFT for unrecognised status', () => {
    expect(transformInvoice(makeInvoice({ Status: 'NA' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const result = transformInvoice(
      makeInvoice({
        LineItems: [
          {
            Number: 1,
            Description: 'Consulting',
            Quantity: 3,
            Rate: 100,
            VATAmount: 60,
            NominalCode: 4000,
            ProductCode: 'CONSULT',
            ProductName: 'Consulting Services',
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('4000')
    expect(li.itemId).toBe('CONSULT')
    expect(li.itemName).toBe('Consulting Services')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(10000)
    expect(li.unitQuantity).toBe(3)
    expect(li.taxAmount).toBe(6000)
    // total = toMinorUnits(100 * 3 + 60) = toMinorUnits(360) = 36000
    expect(li.totalAmount).toBe(36000)
  })

  it('returns empty lineItems array when LineItems is absent', () => {
    expect(transformInvoice(makeInvoice({ LineItems: undefined })).lineItems).toEqual([])
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces output that passes InvoiceSchema validation', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
