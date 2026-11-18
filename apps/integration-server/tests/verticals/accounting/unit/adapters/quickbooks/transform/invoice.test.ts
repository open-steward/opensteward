import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type QBOInvoice } from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/invoice'

function makeInvoice(overrides: Partial<QBOInvoice> = {}): QBOInvoice {
  return {
    Id: '145',
    DocNumber: '1001',
    CustomerRef: { value: '1', name: "Amy's Bird Sanctuary" },
    TxnDate: '2024-01-15',
    DueDate: '2099-12-31',
    TotalAmt: 150.0,
    Balance: 150.0,
    CurrencyRef: { value: 'USD', name: 'United States Dollar' },
    Line: [],
    ...overrides,
  }
}

describe('transformInvoice (QuickBooks Online)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('145')
    expect(result.invoiceNumber).toBe('1001')
    expect(result.contactId).toBe('1')
    expect(result.totalAmount).toBe(150)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('INVOICE')
  })

  it('maps zero balance to PAID', () => {
    const result = transformInvoice(makeInvoice({ Balance: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partial balance to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeInvoice({ Balance: 75, TotalAmt: 150 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps overdue invoice correctly', () => {
    const result = transformInvoice(makeInvoice({ DueDate: '2000-01-01', Balance: 150 }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps authorized invoice correctly', () => {
    const result = transformInvoice(makeInvoice({ DueDate: '2099-12-31', Balance: 150 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('calculates paidAmount correctly', () => {
    const result = transformInvoice(makeInvoice({ TotalAmt: 200, Balance: 50 }))
    expect(result.paidAmount).toBe(150)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('passes raw object through as metadata', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps SalesItemLineDetail line items', () => {
    const raw = makeInvoice({
      Line: [
        {
          Id: '1',
          LineNum: 1,
          Description: 'Consulting',
          Amount: 100,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            UnitPrice: 50,
            Qty: 2,
            ItemRef: { value: '5', name: 'Hours' },
          },
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('5')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(100)
  })

  it('ignores non-SalesItemLineDetail lines', () => {
    const raw = makeInvoice({
      Line: [
        { Id: '1', LineNum: 1, Description: 'Subtotal', Amount: 100, DetailType: 'SubTotalLineDetail' },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
