import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type MisaAmisExpense,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/expense'

function makeRaw(overrides: Partial<MisaAmisExpense> = {}): MisaAmisExpense {
  return {
    id: 'exp-001',
    expense_number: 'EXP-2024-001',
    report_date: '2024-03-05',
    total_amount: 500000,
    vat_amount: 50000,
    status: 0,
    employee_id: 'emp-001',
    description: 'Chi phí công tác',
    expense_details: [],
    ...overrides,
  }
}

describe('transformExpense (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('exp-001')
    expect(result.name).toBe('EXP-2024-001')
    expect(result.userId).toBe('emp-001')
    expect(result.totalAmount).toBe(500000)
    expect(result.taxAmount).toBe(50000)
  })

  it('parses report_date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
  })

  it('maps expense_details to lineItems', () => {
    const raw = makeRaw({
      expense_details: [
        {
          id: 'detail-001',
          description: 'Vé máy bay',
          amount: 300000,
          vat_amount: 30000,
          account_id: 'acc-001',
          account_code: '6421',
        },
      ],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('detail-001')
    expect(li.itemDescription).toBe('Vé máy bay')
    expect(li.totalAmount).toBe(300000)
    expect(li.taxAmount).toBe(30000)
    expect(li.accountId).toBe('acc-001')
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
