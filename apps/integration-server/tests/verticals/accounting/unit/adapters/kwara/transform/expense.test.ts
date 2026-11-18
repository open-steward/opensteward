import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type KwaraExpense } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/expense'

function makeRaw(overrides: Partial<KwaraExpense> = {}): KwaraExpense {
  return { id: 'exp-001', ...overrides }
}

describe('transformExpense (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformExpense(makeRaw())
    expect(r.id).toBe('exp-001')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
