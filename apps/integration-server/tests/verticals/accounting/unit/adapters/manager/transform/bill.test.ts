import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type ManagerPurchaseInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<ManagerPurchaseInvoice> = {}): ManagerPurchaseInvoice {
  return {
    key: 'bill-key-1',
    issueDate: '2024-03-01',
    dueDate: '2024-04-01',
    reference: 'REF-B001',
    supplier: 'supp-uuid',
    description: 'Supplier invoice',
    invoiceAmount: { value: 300.0, currency: 'USD' },
    balanceDue: { value: 300.0, currency: 'USD' },
    status: 'Unpaid',
    closedInvoice: false,
    lines: [],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps key to id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-key-1')
  })

  it('maps reference to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('REF-B001')
  })

  it('falls back to key for billNumber when reference absent', () => {
    expect(transformBill(makeBill({ reference: undefined })).billNumber).toBe('bill-key-1')
  })

  it('maps supplier to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('supp-uuid')
  })

  it('converts invoiceAmount to minor units', () => {
    // 300.0 → 30000
    expect(transformBill(makeBill()).totalAmount).toBe(30000)
  })

  it('maps status Unpaid to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'Unpaid' })).status).toBe('AUTHORIZED')
  })

  it('maps status PaidInFull to PAID', () => {
    expect(transformBill(makeBill({ status: 'PaidInFull' })).status).toBe('PAID')
  })

  it('maps status PartiallyPaid to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'PartiallyPaid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status Overdue to OVERDUE', () => {
    expect(transformBill(makeBill({ status: 'Overdue' })).status).toBe('OVERDUE')
  })

  it('maps status Void to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'Void' })).status).toBe('VOIDED')
  })

  it('maps closedInvoice=true to PAID', () => {
    expect(transformBill(makeBill({ status: undefined, closedInvoice: true })).status).toBe('PAID')
  })

  it('computes paidAmount as totalAmount - balanceAmount', () => {
    const result = transformBill(
      makeBill({
        invoiceAmount: { value: 300.0, currency: 'USD' },
        balanceDue: { value: 100.0, currency: 'USD' },
        status: 'PartiallyPaid',
      }),
    )
    expect(result.totalAmount).toBe(30000)
    expect(result.balanceAmount).toBe(10000)
    expect(result.paidAmount).toBe(20000)
  })

  it('parses issueDate as postedAt', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps lines to lineItems', () => {
    const result = transformBill(
      makeBill({
        lines: [
          {
            account: 'acct-uuid',
            lineDescription: 'Hardware',
            qty: 2,
            unitPrice: 150.0,
            amount: { value: 300.0, currency: 'USD' },
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.accountId).toBe('acct-uuid')
    expect(li.itemDescription).toBe('Hardware')
    expect(li.unitQuantity).toBe(2)
    expect(li.unitAmount).toBe(15000)
    expect(li.totalAmount).toBe(30000)
  })

  it('passes schema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})
