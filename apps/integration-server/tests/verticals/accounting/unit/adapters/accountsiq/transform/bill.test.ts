import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type AccountsIQBill } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/bill'

function makeBill(overrides: Partial<AccountsIQBill> = {}): AccountsIQBill {
  return {
    billId: '2001',
    entityId: '10',
    status: 'Draft',
    billNumber: 'BILL-2024-001',
    billDate: '2024-03-05',
    dueDate: '2024-04-05',
    totalAmount: 605,
    taxAmount: 105,
    currency: 'EUR',
    contactId: '80',
    lines: [],
    ...overrides,
  }
}

describe('transformBill (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('2001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('80')
    expect(result.totalAmount).toBe(605)
    expect(result.taxAmount).toBe(105)
    expect(result.currency).toBe('EUR')
  })

  it('parses billDate as postedAt Date', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
  })

  it('parses dueDate as dueAt Date', () => {
    const result = transformBill(makeBill())
    expect(result.dueAt).toEqual(new Date('2024-04-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    const result = transformBill(makeBill({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Posted status to AUTHORIZED', () => {
    const result = transformBill(makeBill({ status: 'Posted' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    const result = transformBill(makeBill({ status: 'Paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    const result = transformBill(makeBill({ status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformBill(makeBill({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
