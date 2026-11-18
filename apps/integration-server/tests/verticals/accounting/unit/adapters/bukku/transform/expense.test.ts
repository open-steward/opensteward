import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type BukkuExpense } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/expense'

function makeRaw(overrides: Partial<BukkuExpense> = {}): BukkuExpense {
  return {
    id: '30',
    number: 'EXP-001',
    date: '2024-05-01',
    total: 300,
    tax_total: 0,
    status: 'draft',
    employee_id: '5',
    line_items: [],
    ...overrides,
  }
}

describe('transformExpense (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('30')
    expect(result.totalAmount).toBe(300)
    expect(result.userId).toBe('5')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-05-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ number: 'EXP-999' })
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['number']).toBe('EXP-999')
  })

  it('maps tax_total to taxAmount', () => {
    const result = transformExpense(makeRaw({ tax_total: 39 }))
    expect(result.taxAmount).toBe(39)
  })

  it('maps line items', () => {
    const raw = makeRaw({
      line_items: [
        {
          id: '1',
          description: 'Taxi fare',
          quantity: 1,
          unit_price: 300,
          amount: 300,
          tax_amount: 0,
          account_id: '600',
          account_code: '6-001',
        },
      ],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(300)
    expect(result.lineItems![0].itemDescription).toBe('Taxi fare')
    expect(result.lineItems![0].accountId).toBe('600')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
