import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type XeroBill } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/bill'

function makeBill(overrides: Partial<XeroBill> = {}): XeroBill {
  return {
    InvoiceID: 'bill-001',
    InvoiceNumber: 'BILL-2024-001',
    Reference: 'PO-123',
    Contact: { ContactID: 'vendor-1', Name: 'Vendor Ltd' },
    DateString: '2024-03-01',
    DueDateString: '2024-04-01',
    Total: 6000,
    TotalTax: 1000,
    AmountDue: 6000,
    AmountPaid: 0,
    CurrencyCode: 'GBP',
    Status: 'AUTHORISED',
    LineItems: [],
    ...overrides,
  }
}

describe('transformBill (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('bill-001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('vendor-1')
    expect(result.totalAmount).toBe(600000)
    expect(result.taxAmount).toBe(100000)
    expect(result.currency).toBe('GBP')
  })

  it('maps DRAFT status', () => {
    expect(transformBill(makeBill({ Status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps SUBMITTED status', () => {
    expect(transformBill(makeBill({ Status: 'SUBMITTED' })).status).toBe('SUBMITTED')
  })

  it('maps AUTHORISED with full balance to AUTHORIZED', () => {
    const result = transformBill(makeBill({ Status: 'AUTHORISED', AmountDue: 6000, AmountPaid: 0 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps AUTHORISED with zero balance to PAID', () => {
    const result = transformBill(makeBill({ Status: 'AUTHORISED', AmountDue: 0, AmountPaid: 6000 }))
    expect(result.status).toBe('PAID')
  })

  it('maps AUTHORISED with partial payment to PARTIALLY_PAID', () => {
    const result = transformBill(makeBill({ Status: 'AUTHORISED', AmountDue: 3000, AmountPaid: 3000 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps PAID status', () => {
    expect(transformBill(makeBill({ Status: 'PAID', AmountDue: 0, AmountPaid: 6000 })).status).toBe('PAID')
  })

  it('maps VOIDED status', () => {
    expect(transformBill(makeBill({ Status: 'VOIDED' })).status).toBe('VOIDED')
  })

  it('maps DELETED status', () => {
    expect(transformBill(makeBill({ Status: 'DELETED' })).status).toBe('DELETED')
  })

  it('emits postedAt/dueAt as calendar dates, matching the source precision', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toBe('2024-03-01')
    expect(result.dueAt).toBe('2024-04-01')
  })

  it('maps line items correctly', () => {
    const raw = makeBill({
      LineItems: [
        {
          LineItemID: 'li-1',
          Description: 'Service',
          UnitAmount: 500,
          Quantity: 10,
          TaxAmount: 500,
          LineAmount: 5000,
          AccountCode: '400',
          AccountID: 'acc-guid-400',
          ItemCode: 'SVC-01',
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.itemDescription).toBe('Service')
    expect(li.unitAmount).toBe(50000)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(500000)
    expect(li.accountId).toBe('acc-guid-400')
    expect(li.accountCode).toBe('400')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
