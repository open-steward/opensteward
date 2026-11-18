import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type AppFolioExpense } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/expense'

function makeExpense(overrides: Partial<AppFolioExpense> = {}): AppFolioExpense {
  return {
    id: '801',
    date: '2024-03-05',
    description: 'HVAC repair',
    amount: 850,
    tax_amount: 0,
    currency: 'USD',
    vendor_id: '55',
    property_id: 'prop_1',
    ...overrides,
  }
}

describe('transformExpense (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('801')
    expect(result.name).toBe('HVAC repair')
    expect(result.totalAmount).toBe(850)
    expect(result.currency).toBe('USD')
    expect(result.contactId).toBe('55')
  })

  it('parses ISO date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('converts numeric id to string', () => {
    const result = transformExpense(makeExpense({ id: 999 }))
    expect(result.id).toBe('999')
  })

  it('handles missing description gracefully', () => {
    const result = transformExpense(makeExpense({ description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('omits taxAmount when tax_amount is zero', () => {
    const result = transformExpense(makeExpense({ tax_amount: 0 }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('maps non-zero tax amount', () => {
    const result = transformExpense(makeExpense({ tax_amount: 50 }))
    expect(result.taxAmount).toBe(50)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
