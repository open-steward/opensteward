import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type QuickFilePurchase,
} from '../../../../../../../src/verticals/accounting/adapters/quickfile/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<QuickFilePurchase> = {}): QuickFilePurchase {
  return {
    PurchaseID: 12345,
    ReceiptNumber: 'BILL-001',
    SupplierID: 99,
    SupplierName: 'Acme Supplies',
    ReceiptDate: '2024-03-15',
    DueDate: '2024-04-15',
    Currency: 'GBP',
    Status: 'SENT',
    GrossAmount: 500.0,
    VatAmount: 83.33,
    AmountOutstanding: 500.0,
    AmountPaid: 0,
    SupplierReference: 'PO-999',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps PurchaseID to id as string', () => {
    expect(transformBill(makeBill()).id).toBe('12345')
  })

  it('maps ReceiptNumber to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('maps SupplierID to contactId with supp_ prefix', () => {
    expect(transformBill(makeBill()).contactId).toBe('supp_99')
  })

  it('maps Currency to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('GBP')
  })

  it('maps GrossAmount to totalAmount in minor units', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(50000)
  })

  it('maps VatAmount to taxAmount in minor units', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(8333)
  })

  it('maps AmountOutstanding to balanceAmount in minor units', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(50000)
  })

  it('maps SupplierReference to notes', () => {
    expect(transformBill(makeBill()).notes).toBe('PO-999')
  })

  it('maps ReceiptDate to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps DueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-15'))
  })

  it('maps PAIDFULL status to PAID', () => {
    expect(transformBill(makeBill({ Status: 'PAIDFULL' })).status).toBe('PAID')
  })

  it('maps PAIDPART status to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ Status: 'PAIDPART' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps SENT status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ Status: 'SENT' })).status).toBe('AUTHORIZED')
  })

  it('maps ACTIVE status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ Status: 'ACTIVE' })).status).toBe('AUTHORIZED')
  })

  it('maps DISPUTED status to OVERDUE', () => {
    expect(transformBill(makeBill({ Status: 'DISPUTED' })).status).toBe('OVERDUE')
  })

  it('maps DELETED status to DELETED', () => {
    expect(transformBill(makeBill({ Status: 'DELETED' })).status).toBe('DELETED')
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(transformBill(makeBill({ Status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformBill(makeBill({ Status: 'UNKNOWN_VAL' })).status).toBe('DRAFT')
  })

  it('contactId is undefined when SupplierID is absent', () => {
    expect(transformBill(makeBill({ SupplierID: undefined })).contactId).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces output that passes BillSchema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformBill({ PurchaseID: 1 })
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
