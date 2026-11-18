import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type AccountEdgeExpense,
} from '../../../../../../../src/verticals/accounting/adapters/accountedge/transform/expense'

function makeExpense(overrides: Partial<AccountEdgeExpense> = {}): AccountEdgeExpense {
  return {
    id: 'exp-001',
    name: 'Office Supplies',
    account_id: 'acc-200',
    contact_id: 'ct-100',
    currency: 'USD',
    tax_amount: 25,
    total: 250,
    date: '2024-02-20',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from raw id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-001')
  })

  it('maps name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office Supplies')
  })

  it('maps account_id to accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('acc-200')
  })

  it('maps contact_id to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('ct-100')
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(25)
  })

  it('maps total to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(250)
  })

  it('parses date to postedAt', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-02-20'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformExpense(makeExpense({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformExpense(makeExpense({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined taxAmount when tax_amount is 0', () => {
    expect(transformExpense(makeExpense({ tax_amount: 0 })).taxAmount).toBeUndefined()
  })

  it('returns undefined accountId when account_id is empty', () => {
    expect(transformExpense(makeExpense({ account_id: '' })).accountId).toBeUndefined()
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
