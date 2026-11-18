import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type BlExpense } from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/expense'

function makeExpense(overrides: Partial<BlExpense> = {}): BlExpense {
  return {
    Id: 'exp-uuid-1234',
    Description: 'Office supplies',
    SupplierId: 'supp-uuid-5678',
    Currency: 'SEK',
    TotalAmount: 2500,
    VatAmount: 500,
    ExpenseDate: '2024-03-15',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('exp-uuid-1234')
  })

  it('maps description to name', () => {
    const result = transformExpense(makeExpense())
    expect(result.name).toBe('Office supplies')
  })

  it('maps supplierId to contactId', () => {
    const result = transformExpense(makeExpense())
    expect(result.contactId).toBe('supp-uuid-5678')
  })

  it('maps currency', () => {
    const result = transformExpense(makeExpense())
    expect(result.currency).toBe('SEK')
  })

  it('maps totalAmount', () => {
    const result = transformExpense(makeExpense())
    expect(result.totalAmount).toBe(2500)
  })

  it('maps vatAmount to taxAmount', () => {
    const result = transformExpense(makeExpense())
    expect(result.taxAmount).toBe(500)
  })

  it('returns undefined taxAmount when VatAmount is 0', () => {
    const result = transformExpense(makeExpense({ VatAmount: 0 }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('parses expenseDate as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined for missing date', () => {
    const result = transformExpense(makeExpense({ ExpenseDate: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('returns undefined for empty string fields', () => {
    const result = transformExpense(makeExpense({ Description: '', SupplierId: '', Currency: '' }))
    expect(result.name).toBeUndefined()
    expect(result.contactId).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
