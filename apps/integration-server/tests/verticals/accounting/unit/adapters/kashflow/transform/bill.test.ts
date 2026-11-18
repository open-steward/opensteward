import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type KashflowPurchase,
} from '../../../../../../../src/verticals/accounting/adapters/kashflow/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<KashflowPurchase> = {}): KashflowPurchase {
  return {
    Number: 55,
    Id: 'purchase-uuid-55',
    SupplierCode: 'SUPP001',
    SupplierName: 'Acme Supplies',
    IssuedDate: '2024-02-01',
    DueDate: '2024-03-01',
    GrossAmount: 100,
    NetAmount: 80,
    VATAmount: 20,
    TotalPaidAmount: 0,
    Status: 'Unpaid',
    Currency: { Code: 'GBP' },
    LineItems: [],
    Permalink: 'https://kashflow.example/bills/55',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps Number to id when present', () => {
    expect(transformBill(makeBill({ Number: 55 })).id).toBe('55')
  })

  it('falls back to Id string when Number is absent', () => {
    expect(transformBill(makeBill({ Number: undefined, Id: 'purchase-uuid-55' })).id).toBe(
      'purchase-uuid-55',
    )
  })

  it('maps Number to billNumber when present', () => {
    expect(transformBill(makeBill({ Number: 55 })).billNumber).toBe('55')
  })

  it('leaves billNumber undefined when Number is absent', () => {
    expect(transformBill(makeBill({ Number: undefined })).billNumber).toBeUndefined()
  })

  it('maps SupplierCode to contactId', () => {
    expect(transformBill(makeBill({ SupplierCode: 'SUPP001' })).contactId).toBe('SUPP001')
  })

  it('maps Currency.Code to currency', () => {
    expect(transformBill(makeBill({ Currency: { Code: 'GBP' } })).currency).toBe('GBP')
  })

  it('converts GrossAmount decimal pounds to minor units', () => {
    expect(transformBill(makeBill({ GrossAmount: 100 })).totalAmount).toBe(10000)
  })

  it('converts VATAmount decimal pounds to minor units', () => {
    expect(transformBill(makeBill({ VATAmount: 20 })).taxAmount).toBe(2000)
  })

  it('converts TotalPaidAmount decimal pounds to minor units', () => {
    expect(transformBill(makeBill({ GrossAmount: 100, TotalPaidAmount: 40 })).paidAmount).toBe(4000)
  })

  it('computes balanceAmount as totalAmount minus paidAmount', () => {
    const result = transformBill(makeBill({ GrossAmount: 100, TotalPaidAmount: 40 }))
    expect(result.balanceAmount).toBe(6000)
  })

  it('maps Permalink to url', () => {
    const result = transformBill(makeBill({ Permalink: 'https://kashflow.example/bills/55' }))
    expect(result.url).toBe('https://kashflow.example/bills/55')
  })

  it('maps status PAID when Status is "paid"', () => {
    expect(transformBill(makeBill({ Status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PAID when Status is "overpaid"', () => {
    expect(transformBill(makeBill({ Status: 'overpaid' })).status).toBe('PAID')
  })

  it('maps status OVERDUE when Status is "overdue"', () => {
    expect(transformBill(makeBill({ Status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps status AUTHORIZED when Status is "unpaid" with no payment', () => {
    const result = transformBill(
      makeBill({ Status: 'Unpaid', GrossAmount: 100, TotalPaidAmount: 0 }),
    )
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status PARTIALLY_PAID when Status is "unpaid" and partial payment made', () => {
    // PARTIALLY_PAID: Status=unpaid, TotalPaidAmount > 0, TotalPaidAmount < GrossAmount
    const result = transformBill(
      makeBill({ Status: 'Unpaid', GrossAmount: 100, TotalPaidAmount: 40 }),
    )
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps status DRAFT for unrecognised status value', () => {
    expect(transformBill(makeBill({ Status: 'NA' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const result = transformBill(
      makeBill({
        LineItems: [
          {
            Number: 1,
            Description: 'Widget',
            Quantity: 2,
            Rate: 50,
            VATAmount: 10,
            NominalCode: 4000,
            ProductCode: 'WDG-01',
            ProductName: 'Widget Pro',
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('4000')
    expect(li.itemId).toBe('WDG-01')
    expect(li.itemName).toBe('Widget Pro')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(5000)
    expect(li.unitQuantity).toBe(2)
    expect(li.taxAmount).toBe(1000)
    // total = toMinorUnits(Rate * Quantity + VATAmount) = (50*2+10)*100 = 11000
    expect(li.totalAmount).toBe(11000)
  })

  it('line item falls back to NominalName when ProductName is absent', () => {
    const result = transformBill(
      makeBill({
        LineItems: [{ Number: 1, NominalName: 'Sales Revenue', ProductName: undefined }],
      }),
    )
    expect(result.lineItems![0].itemName).toBe('Sales Revenue')
  })

  it('produces empty lineItems array when LineItems is absent', () => {
    expect(transformBill(makeBill({ LineItems: undefined })).lineItems).toEqual([])
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces output that passes BillSchema validation', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
