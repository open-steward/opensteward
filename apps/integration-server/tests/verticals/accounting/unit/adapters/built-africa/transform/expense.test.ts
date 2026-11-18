import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type BuiltAfricaExpense,
} from '../../../../../../../src/verticals/accounting/adapters/built-africa/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<BuiltAfricaExpense> = {}): BuiltAfricaExpense {
  return {
    id: 55,
    ref: 'EXP-055',
    description: 'Client travel expense',
    amount: 250.75,
    base_currency: 'USD',
    entry_date: '2024-03-10',
    expense_account: { id: 301, account_name: 'Travel' },
    created_at: '2024-03-10T08:00:00Z',
    updated_at: '2024-03-11T12:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id to string', () => {
    expect(transformExpense(makeExpense()).id).toBe('55')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Client travel expense')
  })

  it('maps expense_account.id to accountId as string', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('301')
  })

  it('returns undefined accountId when expense_account is absent', () => {
    expect(transformExpense(makeExpense({ expense_account: undefined })).accountId).toBeUndefined()
  })

  it('maps base_currency to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('falls back to fx_currency when base_currency is absent', () => {
    expect(
      transformExpense(makeExpense({ base_currency: undefined, fx_currency: 'NGN' })).currency,
    ).toBe('NGN')
  })

  it('maps amount to totalAmount in minor units', () => {
    expect(transformExpense(makeExpense({ amount: 250.75 })).totalAmount).toBe(25075)
  })

  it('maps entry_date to postedAt as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('returns undefined postedAt when entry_date is absent', () => {
    expect(transformExpense(makeExpense({ entry_date: undefined })).postedAt).toBeUndefined()
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformExpense(makeExpense()).createdAt).toEqual(new Date('2024-03-10T08:00:00Z'))
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformExpense(makeExpense()).updatedAt).toEqual(new Date('2024-03-11T12:00:00Z'))
  })

  it('returns undefined name when description is absent', () => {
    expect(transformExpense(makeExpense({ description: undefined })).name).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeExpense()))).not.toThrow()
  })
})
