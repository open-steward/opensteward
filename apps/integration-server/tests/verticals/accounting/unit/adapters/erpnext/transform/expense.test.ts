import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ErpNextExpense } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/expense'

function makeRaw(overrides: Partial<ErpNextExpense> = {}): ErpNextExpense {
  return {
    name: 'EXP-2024-00001',
    posting_date: '2024-01-10',
    due_date: '2024-01-31',
    base_grand_total: 5000,
    base_total_taxes_and_charges: 900,
    status: 'Submitted',
    currency: 'INR',
    employee: 'EMP-001',
    remarks: 'Travel expenses',
    items: [],
    ...overrides,
  }
}

describe('transformExpense (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('EXP-2024-00001')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(900)
    expect(result.currency).toBe('INR')
    expect(result.contactId).toBe('EMP-001')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
