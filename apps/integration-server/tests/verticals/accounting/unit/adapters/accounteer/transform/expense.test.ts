import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type AccounteerExpense } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/expense'

function makeRaw(overrides: Partial<AccounteerExpense> = {}): AccounteerExpense {
  return { id: '1', ...overrides }
}

describe('accounteer transformExpense', () => {
  it('maps id', () => {
    expect(transformExpense(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformExpense(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformExpense(raw).metadata).toBe(raw)
  })
  it('maps description to name', () => {
    expect(transformExpense(makeRaw({ description: 'Office supplies' })).name).toBe('Office supplies')
  })
  it('maps date to postedAt as Date', () => {
    const result = transformExpense(makeRaw({ date: '2024-02-10' }))
    expect(result.postedAt).toEqual(new Date('2024-02-10'))
  })
  it('maps contact_id', () => {
    expect(transformExpense(makeRaw({ contact_id: '42' })).contactId).toBe('42')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
