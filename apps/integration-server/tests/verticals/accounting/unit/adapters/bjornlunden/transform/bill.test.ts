import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type BlBill } from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/bill'

function makeBill(overrides: Partial<BlBill> = {}): BlBill {
  return {
    Id: 'bill-uuid-1234',
    BillNumber: 2001,
    SupplierId: 'supp-uuid-5678',
    Currency: 'SEK',
    BillDate: '2024-03-10',
    DueDate: '2024-04-10',
    TotalAmount: 8000,
    VatAmount: 1600,
    RemainingAmount: 8000,
    PaidAmount: 0,
    Status: 'Approved',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('bill-uuid-1234')
  })

  it('maps billNumber as string', () => {
    const result = transformBill(makeBill())
    expect(result.billNumber).toBe('2001')
  })

  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.contactId).toBe('supp-uuid-5678')
    expect(result.currency).toBe('SEK')
    expect(result.totalAmount).toBe(8000)
    expect(result.taxAmount).toBe(1600)
    expect(result.balanceAmount).toBe(8000)
    expect(result.paidAmount).toBe(0)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
    expect(result.dueAt).toEqual(new Date('2024-04-10'))
  })

  it('returns undefined for missing date fields', () => {
    const result = transformBill(makeBill({ BillDate: '', DueDate: '' }))
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
  })

  it('maps Draft status', () => {
    const result = transformBill(makeBill({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    const result = transformBill(makeBill({ Status: 'Approved' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid status', () => {
    const result = transformBill(makeBill({ Status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps PartiallyPaid status', () => {
    const result = transformBill(makeBill({ Status: 'PartiallyPaid' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    const result = transformBill(makeBill({ Status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformBill(makeBill({ Status: 'Unknown' }))
    expect(result.status).toBe('DRAFT')
  })

  it('returns undefined for empty string fields', () => {
    const result = transformBill(makeBill({ SupplierId: '', Currency: '' }))
    expect(result.contactId).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
