import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/bind-erp/transform/bill'
import type { BindExpenseDetails } from '../../../../../../../src/verticals/accounting/adapters/bind-erp/transform/expense'

function makeBill(overrides: Partial<BindExpenseDetails> = {}): BindExpenseDetails {
  return {
    ID: 'bill-1',
    UUID: 'uuid-bill-1',
    ProviderID: 'prov-1',
    ProviderName: 'Acme Supplies',
    StatusCode: 1,
    CreationDate: '2024-03-15T00:00:00',
    DocumentNumber: 'BILL-001',
    Series: 'A',
    Comments: 'Monthly supplies',
    VAT: 160,
    IEPS: 40,
    VATRetention: 20,
    ISRRetention: 10,
    Discount: 50,
    CurrencyName: 'MXN',
    CurrencyID: 'MX',
    ExpensePurchaseOrderItems: [
      { ID: 'item-1', IndexItem: 0, TypeID: 'prod-1', Name: 'Widget', Cost: 500, Qty: 2 },
      { ID: 'item-2', IndexItem: 1, TypeID: 'prod-2', Name: 'Gadget', Cost: 300, Qty: 1 },
    ],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('prefers ID over UUID for id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-1')
  })

  it('falls back to UUID when ID is absent', () => {
    expect(transformBill(makeBill({ ID: undefined })).id).toBe('uuid-bill-1')
  })

  it('returns empty string when both ID and UUID are absent', () => {
    expect(transformBill(makeBill({ ID: undefined, UUID: undefined })).id).toBe('')
  })

  it('maps DocumentNumber to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('falls back to Series when DocumentNumber is absent', () => {
    expect(transformBill(makeBill({ DocumentNumber: undefined })).billNumber).toBe('A')
  })

  it('maps ProviderID to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('prov-1')
  })

  it('prefers CurrencyName over CurrencyID', () => {
    expect(transformBill(makeBill()).currency).toBe('MXN')
  })

  it('falls back to CurrencyID when CurrencyName is absent', () => {
    expect(transformBill(makeBill({ CurrencyName: undefined })).currency).toBe('MX')
  })

  it('maps Comments to notes', () => {
    expect(transformBill(makeBill()).notes).toBe('Monthly supplies')
  })

  it('computes taxAmount as VAT + IEPS - VATRetention - ISRRetention', () => {
    // 160 + 40 - 20 - 10 = 170
    expect(transformBill(makeBill()).taxAmount).toBe(170)
  })

  it('computes totalAmount from item subtotals minus discount plus tax', () => {
    // subtotal = 500*2 + 300*1 = 1300; tax = 170; total = 1300 - 50 + 170 = 1420
    expect(transformBill(makeBill()).totalAmount).toBe(1420)
  })

  it('maps Discount to discountAmount', () => {
    expect(transformBill(makeBill()).discountAmount).toBe(50)
  })

  it('status is AUTHORIZED for StatusCode 1', () => {
    expect(transformBill(makeBill({ StatusCode: 1 })).status).toBe('AUTHORIZED')
  })

  it('status is VOIDED for StatusCode 2', () => {
    expect(transformBill(makeBill({ StatusCode: 2 })).status).toBe('VOIDED')
  })

  it('status is PAID for StatusCode 3', () => {
    expect(transformBill(makeBill({ StatusCode: 3 })).status).toBe('PAID')
  })

  it('status defaults to AUTHORIZED for unknown StatusCode', () => {
    expect(transformBill(makeBill({ StatusCode: undefined })).status).toBe('AUTHORIZED')
  })

  it('maps line items with IndexItem as id', () => {
    const bill = transformBill(makeBill())
    expect(bill.lineItems).toHaveLength(2)
    expect(bill.lineItems![0].id).toBe('0')
    expect(bill.lineItems![0].itemId).toBe('prod-1')
    expect(bill.lineItems![0].itemName).toBe('Widget')
    expect(bill.lineItems![0].unitAmount).toBe(500)
    expect(bill.lineItems![0].unitQuantity).toBe(2)
  })

  it('maps line item id to item ID when IndexItem is absent', () => {
    const bill = transformBill(
      makeBill({
        ExpensePurchaseOrderItems: [
          { ID: 'item-x', TypeID: 't1', Name: 'Item', Cost: 100, Qty: 1 },
        ],
      }),
    )
    expect(bill.lineItems![0].id).toBe('item-x')
  })

  it('rounds fractional Qty to integer for line items', () => {
    const bill = transformBill(
      makeBill({
        ExpensePurchaseOrderItems: [{ IndexItem: 0, Cost: 100, Qty: 2.7 }],
      }),
    )
    expect(bill.lineItems![0].unitQuantity).toBe(3)
  })

  it('returns undefined lineItems when items array is empty', () => {
    expect(transformBill(makeBill({ ExpensePurchaseOrderItems: [] })).lineItems).toBeUndefined()
  })

  it('maps CreationDate to postedAt and createdAt as Date objects', () => {
    const bill = transformBill(makeBill())
    expect(bill.postedAt).toEqual(new Date('2024-03-15T00:00:00'))
    expect(bill.createdAt).toEqual(new Date('2024-03-15T00:00:00'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
