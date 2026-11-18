import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type MediusSupplierInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/medius/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<MediusSupplierInvoice> = {}): MediusSupplierInvoice {
  return {
    documentId: 1001,
    invoiceNumber: 'INV-1001',
    supplierExternalSystemId: 'sup_ext_001',
    supplierId: 'sup_001',
    supplierName: 'Acme Supplies',
    currencyCode: 'USD',
    netAmount: 1000.0,
    taxAmount: 100.0,
    totalAmount: 1100.0,
    invoiceDate: '2024-03-01T00:00:00.000Z',
    dueDate: '2024-04-01T00:00:00.000Z',
    isPaymentBlocked: false,
    ...overrides,
  }
}

describe('transformBill (medius)', () => {
  it('maps documentId to id as string', () => {
    expect(transformBill(makeBill()).id).toBe('1001')
  })

  it('maps invoiceNumber to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('INV-1001')
  })

  it('prefers supplierExternalSystemId for contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('sup_ext_001')
  })

  it('falls back to supplierId when supplierExternalSystemId is absent', () => {
    const result = transformBill(makeBill({ supplierExternalSystemId: undefined }))
    expect(result.contactId).toBe('sup_001')
  })

  it('maps currencyCode to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('converts decimal totalAmount to integer minor units', () => {
    // 1100.00 * 100 = 110000
    expect(transformBill(makeBill()).totalAmount).toBe(110000)
  })

  it('converts decimal taxAmount to integer minor units', () => {
    // 100.00 * 100 = 10000
    expect(transformBill(makeBill()).taxAmount).toBe(10000)
  })

  it('maps invoiceDate to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01T00:00:00.000Z'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-01T00:00:00.000Z'))
  })

  it('maps status AUTHORIZED when not blocked, no finalVoucherNumber, and not overdue', () => {
    // Use a future due date so the overdue branch is not triggered
    const result = transformBill(
      makeBill({ isPaymentBlocked: false, dueDate: '2099-01-01T00:00:00.000Z' }),
    )
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status PAID when finalVoucherNumber is set', () => {
    expect(transformBill(makeBill({ finalVoucherNumber: 'FV-99' })).status).toBe('PAID')
  })

  it('sets paidAmount equal to totalAmount when finalVoucherNumber is present', () => {
    const result = transformBill(makeBill({ finalVoucherNumber: 'FV-99' }))
    expect(result.paidAmount).toBe(110000)
  })

  it('maps invoiceReference to notes', () => {
    const result = transformBill(makeBill({ invoiceReference: 'REF-42' }))
    expect(result.notes).toBe('REF-42')
  })

  it('maps line items with decimal amounts converted to minor units', () => {
    const raw = makeBill({
      invoiceLines: [
        {
          lineNumber: 1,
          itemDescription: 'Widget',
          itemNumber: 'WGT-1',
          amount: 10.0,
          quantity: 2,
          unitPrice: 5.0,
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].totalAmount).toBe(1000) // 10.00 * 100
    expect(result.lineItems![0].unitAmount).toBe(500) // 5.00 * 100
    expect(result.lineItems![0].unitQuantity).toBe(2)
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('passes BillSchema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})
