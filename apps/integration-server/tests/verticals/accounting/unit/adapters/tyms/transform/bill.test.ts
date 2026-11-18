import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type TymsExpense,
} from '../../../../../../../src/verticals/accounting/adapters/tyms/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<TymsExpense> = {}): TymsExpense {
  return {
    uuid: 'bill-001',
    title: 'Supplier Invoice',
    date: '2024-02-01',
    due_date: '2024-03-01',
    amount: 8000,
    tax: 1600,
    currency: 'USD',
    status: 'approved',
    vendor: { uuid: 'sup-55', name: 'Supplier Co' },
    note: 'Net 30 terms',
    created_at: '2024-02-01T00:00:00.000Z',
    updated_at: '2024-02-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('bill-001')
    expect(result.contactId).toBe('sup-55')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(8000)
    expect(result.taxAmount).toBe(1600)
    expect(result.notes).toBe('Net 30 terms')
  })

  it('maps status=approved to AUTHORIZED', () => {
    const result = transformBill(makeBill({ status: 'approved' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status=paid to PAID', () => {
    const result = transformBill(makeBill({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps status=partial to PARTIALLY_PAID', () => {
    const result = transformBill(makeBill({ status: 'partial' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps status=overdue to OVERDUE', () => {
    const result = transformBill(makeBill({ status: 'overdue' }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps status=void to VOIDED', () => {
    const result = transformBill(makeBill({ status: 'void' }))
    expect(result.status).toBe('VOIDED')
  })

  it('defaults unknown status to DRAFT', () => {
    const result = transformBill(makeBill({ status: 'unknown_state' }))
    expect(result.status).toBe('DRAFT')
  })

  it('extracts tax from object form', () => {
    const result = transformBill(makeBill({ tax: { amount: 200 } }))
    expect(result.taxAmount).toBe(200)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-02-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw as metadata', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
