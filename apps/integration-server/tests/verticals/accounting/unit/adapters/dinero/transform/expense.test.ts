import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type DineroExpense } from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/expense'

function makeExpense(overrides: Partial<DineroExpense> = {}): DineroExpense {
  return {
    Guid: 'exp-guid-001',
    Description: 'Office supplies',
    ContactGuid: 'supplier-guid-001',
    Currency: 'DKK',
    TotalInclVat: 1250,
    TotalVat: 250,
    Date: '2024-02-01',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps Guid to id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-guid-001')
  })

  it('maps Description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps ContactGuid to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('supplier-guid-001')
  })

  it('maps TotalInclVat to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(1250)
  })

  it('maps TotalVat to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(250)
  })

  it('maps Currency to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('DKK')
  })

  it('maps Date to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-02-01')).toBe(true)
  })

  it('returns undefined postedAt when Date is empty', () => {
    expect(transformExpense(makeExpense({ Date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when Description is empty', () => {
    expect(transformExpense(makeExpense({ Description: '' })).name).toBeUndefined()
  })

  it('returns undefined contactId when ContactGuid is empty', () => {
    expect(transformExpense(makeExpense({ ContactGuid: '' })).contactId).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
