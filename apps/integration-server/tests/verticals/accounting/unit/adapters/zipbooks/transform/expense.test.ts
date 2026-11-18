import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type ZipBooksExpense,
} from '../../../../../../../src/verticals/accounting/adapters/zipbooks/transform/expense'

function makeExpense(overrides: Partial<ZipBooksExpense> = {}): ZipBooksExpense {
  return {
    id: 'exp-001',
    name: 'Office Supplies',
    account_id: 'acc-5000',
    contact_id: 'contact-3',
    currency: 'USD',
    tax_amount: 31.5,
    total: 181.5,
    date: '2024-02-16',
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
    expect(transformExpense(makeExpense()).accountId).toBe('acc-5000')
  })

  it('maps contact_id to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('contact-3')
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(18150)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(3150)
  })

  it('maps date (ISO string) to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.postedAt).toEqual(new Date('2024-02-16'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformExpense(makeExpense({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformExpense(makeExpense({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined contactId when contact_id is empty', () => {
    expect(transformExpense(makeExpense({ contact_id: '' })).contactId).toBeUndefined()
  })

  it('returns undefined taxAmount when tax_amount is 0', () => {
    expect(transformExpense(makeExpense({ tax_amount: 0 })).taxAmount).toBeUndefined()
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
