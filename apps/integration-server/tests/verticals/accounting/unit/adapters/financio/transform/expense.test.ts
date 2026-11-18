import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type FinancioExpense } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/expense'

function makeRaw(overrides: Partial<FinancioExpense> = {}): FinancioExpense {
  return {
    id: '500',
    reference: 'EXP-001',
    date: '2024-05-01',
    total: 200,
    tax_total: 0,
    status: 'draft',
    employee_id: '3',
    items: [],
    ...overrides,
  }
}

describe('transformExpense (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('500')
    expect(result.totalAmount).toBe(200)
    expect(result.userId).toBe('3')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-05-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ reference: 'EXP-SPECIAL' })
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['reference']).toBe('EXP-SPECIAL')
  })

  it('maps tax_total to taxAmount', () => {
    const result = transformExpense(makeRaw({ tax_total: 12 }))
    expect(result.taxAmount).toBe(12)
  })

  it('maps items to lineItems', () => {
    const raw = makeRaw({
      items: [
        {
          id: '1',
          description: 'Taxi',
          qty: 1,
          unit_price: 200,
          amount: 200,
          tax_amount: 0,
          account_code: '6-001',
        },
      ],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Taxi')
    expect(result.lineItems![0].totalAmount).toBe(200)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
