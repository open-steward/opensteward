import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type FAExpense } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/expense'

function makeRaw(overrides: Partial<FAExpense> = {}): FAExpense {
  return {
    id: 30,
    reference: 'EXP-2024-001',
    tran_date: '2024-01-10',
    total: 350,
    memo: 'Office supplies',
    lines: [
      { id: 1, account: '6000', memo: 'Paper', amount: 350, tax_amount: 70 },
    ],
    ...overrides,
  }
}

describe('transformExpense (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('30')
    expect(result.name).toBe('EXP-2024-001')
    expect(result.totalAmount).toBe(350)
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
  })

  it('maps line items', () => {
    const result = transformExpense(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Paper')
    expect(result.lineItems![0].totalAmount).toBe(350)
    expect(result.lineItems![0].taxAmount).toBe(70)
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
