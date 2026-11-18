import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type LogoExpense } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/expense'

function makeExpense(overrides: Partial<LogoExpense> = {}): LogoExpense {
  return {
    id: '600',
    Date: '2024-04-10',
    Description: 'Office supplies',
    Amount: 750,
    CategoryId: 'cat_office',
    ContactId: 'vendor_7',
    Currency: 'TRY',
    ...overrides,
  }
}

describe('transformExpense (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformExpense(makeExpense()).id).toBe('600')
  })

  it('maps name from Description', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps totalAmount from Amount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(750)
  })

  it('maps currency from Currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('TRY')
  })

  it('maps contactId from ContactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('vendor_7')
  })

  it('parses date as Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-04-10'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: LogoExpense = { id: '999' }
    const e = transformExpense(raw)
    expect(e.id).toBe('999')
    expect(e.name).toBeUndefined()
    expect(e.totalAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
