import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type SilverfinExpense } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/expense'

function makeExpense(overrides: Partial<SilverfinExpense> = {}): SilverfinExpense {
  return {
    id: '800',
    period: '2024-03-10',
    description: 'Travel expense',
    value: 350,
    contact_id: '42',
    ...overrides,
  }
}

describe('transformExpense (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('800')
    expect(result.name).toBe('Travel expense')
    expect(result.totalAmount).toBe(350)
    expect(result.contactId).toBe('42')
  })

  it('parses period as postedAt Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined name when description is empty', () => {
    const result = transformExpense(makeExpense({ description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('returns undefined contactId when contact_id is absent', () => {
    const result = transformExpense(makeExpense({ contact_id: '' }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined postedAt when period is empty', () => {
    const result = transformExpense(makeExpense({ period: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
