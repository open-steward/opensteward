import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type DolibarrExpense } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/expense'

function makeRaw(overrides: Partial<DolibarrExpense> = {}): DolibarrExpense {
  return {
    rowid: 8,
    ref: 'ER-2024-001',
    date_debut: 1705276800,
    total_ht: 200,
    total_tva: 40,
    total_ttc: 240,
    lines: [
      {
        id: 1,
        comments: 'Hotel Paris',
        qty: 1,
        value_unit: 200,
        total_ttc: 240,
        total_tva: 40,
      },
    ],
    ...overrides,
  }
}

describe('transformExpense (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('8')
    expect(result.name).toBe('ER-2024-001')
    expect(result.totalAmount).toBe(240)
  })

  it('parses unix timestamp as Date', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('maps line items', () => {
    const result = transformExpense(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Hotel Paris')
    expect(result.lineItems![0].totalAmount).toBe(240)
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
