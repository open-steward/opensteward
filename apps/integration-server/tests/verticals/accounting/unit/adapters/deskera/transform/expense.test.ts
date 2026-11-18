import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type DeskeraExpense,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/expense'

function makeRaw(overrides: Partial<DeskeraExpense> = {}): DeskeraExpense {
  return {
    id: 'EXP-001',
    expenseCode: 'EXP-2024-001',
    expenseDate: '2024-01-20',
    totalAmount: 1500,
    taxAmount: 135,
    status: 'APPROVED',
    contactCode: 'VEND-001',
    description: 'Travel expenses',
    expenseItems: [],
    ...overrides,
  }
}

describe('transformExpense (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('EXP-001')
    expect(result.name).toBe('Travel expenses')
    expect(result.contactId).toBe('VEND-001')
    expect(result.totalAmount).toBe(1500)
    expect(result.taxAmount).toBe(135)
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-20'))
  })

  it('falls back to expenseCode when description is absent', () => {
    const result = transformExpense(makeRaw({ description: undefined }))
    expect(result.name).toBe('EXP-2024-001')
  })

  it('maps expense items to lineItems', () => {
    const raw = makeRaw({
      expenseItems: [
        {
          id: 'ei-1',
          description: 'Hotel stay',
          amount: 1000,
          taxAmount: 90,
          accountCode: 'TRAVEL-001',
        },
      ],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemDescription).toBe('Hotel stay')
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(90)
    expect(li.accountId).toBe('TRAVEL-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
