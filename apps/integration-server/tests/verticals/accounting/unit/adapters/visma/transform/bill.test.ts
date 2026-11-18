import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type VismaSupplierInvoice } from '../../../../../../../src/verticals/accounting/adapters/visma/transform/bill'

function makeBill(overrides: Partial<VismaSupplierInvoice> = {}): VismaSupplierInvoice {
  return {
    Id: 'bill-uuid-1234',
    SupplierId: 'supp-uuid-5678',
    SupplierNumber: '2001',
    InvoiceDate: '2024-02-01',
    DueDate: '2024-03-01',
    TotalAmount: 8000,
    VatAmount: 1600,
    RemainingAmount: 8000,
    CurrencyCode: 'SEK',
    InvoiceNumber: 'INV-2024-001',
    CreatedUtc: '2024-02-01T09:00:00Z',
    ModifiedUtc: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('bill-uuid-1234')
    expect(result.billNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('supp-uuid-5678')
    expect(result.totalAmount).toBe(8000)
    expect(result.taxAmount).toBe(1600)
    expect(result.balanceAmount).toBe(8000)
    expect(result.currency).toBe('SEK')
  })

  it('parses dates', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-02-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-01'))
  })

  it('maps bill with remaining amount to AUTHORIZED', () => {
    const result = transformBill(makeBill({ RemainingAmount: 8000, TotalAmount: 8000 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps fully paid bill to PAID', () => {
    const result = transformBill(makeBill({ RemainingAmount: 0, TotalAmount: 8000 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partially paid bill to PARTIALLY_PAID', () => {
    const result = transformBill(makeBill({ RemainingAmount: 3000, TotalAmount: 8000 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('passes raw object through as metadata', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
