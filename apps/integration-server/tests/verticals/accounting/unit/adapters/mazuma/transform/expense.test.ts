import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type MazumaExpense } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/expense'

function makeRaw(overrides: Partial<MazumaExpense> = {}): MazumaExpense {
  return { id: '1', ...overrides }
}

describe('mazuma transformExpense', () => {
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
  it('defaults currency to GBP', () => {
    expect(transformExpense(makeRaw()).currency).toBe('GBP')
  })
  it('maps description to name', () => {
    expect(transformExpense(makeRaw({ description: 'Travel' })).name).toBe('Travel')
  })
  it('maps date to postedAt as Date', () => {
    expect(transformExpense(makeRaw({ date: '2024-02-10' })).postedAt).toEqual(new Date('2024-02-10'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
