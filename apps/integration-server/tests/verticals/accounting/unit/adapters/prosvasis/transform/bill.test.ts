import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type ProsvasisBill } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/bill'

function makeBill(overrides: Partial<ProsvasisBill> = {}): ProsvasisBill {
  return {
    id: '2001',
    SeriesNumber: 'BILL-2024-001',
    Status: 'Draft',
    IssueDate: '2024-03-01',
    DueDate: '2024-03-31',
    TotalAmount: 992,
    VatAmount: 192,
    Currency: 'EUR',
    SupplierId: '75',
    Lines: [],
    ...overrides,
  }
}

describe('transformBill (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('2001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('75')
    expect(result.totalAmount).toBe(992)
    expect(result.taxAmount).toBe(192)
    expect(result.currency).toBe('EUR')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('maps Draft to DRAFT', () => {
    const result = transformBill(makeBill({ Status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Issued to AUTHORIZED', () => {
    const result = transformBill(makeBill({ Status: 'Issued' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid to PAID', () => {
    const result = transformBill(makeBill({ Status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps Cancelled to VOIDED', () => {
    const result = transformBill(makeBill({ Status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
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
