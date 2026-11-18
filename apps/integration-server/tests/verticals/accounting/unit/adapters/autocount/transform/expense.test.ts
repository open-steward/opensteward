import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type AutocountExpense,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/expense'

function makeRaw(overrides: Partial<AutocountExpense> = {}): AutocountExpense {
  return {
    DocNo: 'EXP-001',
    Description: 'Office supplies',
    DocDate: '2024-03-10',
    DocAmt: 200,
    TaxAmt: 12,
    CurrencyCode: 'MYR',
    CreditorCode: 'CR001',
    ...overrides,
  }
}

describe('transformExpense (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeRaw())
    expect(result.id).toBe('EXP-001')
    expect(result.name).toBe('Office supplies')
    expect(result.contactId).toBe('CR001')
    expect(result.currency).toBe('MYR')
    expect(result.totalAmount).toBe(200)
    expect(result.taxAmount).toBe(12)
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits taxAmount when zero', () => {
    const result = transformExpense(makeRaw({ TaxAmt: 0 }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
