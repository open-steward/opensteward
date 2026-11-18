import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type SellsyExpense,
} from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/expense'

function makeExpense(overrides: Partial<SellsyExpense> = {}): SellsyExpense {
  return {
    id: 'exp-001',
    title: 'Déplacement client',
    contact_id: 'contact-1',
    currency: 'EUR',
    date: '2024-03-05',
    total_amount: 350,
    tax_amount: 58.33,
    account_id: 'acc-625',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from raw id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-001')
  })

  it('maps title to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Déplacement client')
  })

  it('maps contact_id to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('contact-1')
  })

  it('maps account_id to accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('acc-625')
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(35000)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(5833)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-05'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformExpense(makeExpense({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when title is empty', () => {
    expect(transformExpense(makeExpense({ title: '' })).name).toBeUndefined()
  })

  it('returns undefined contactId when empty', () => {
    expect(transformExpense(makeExpense({ contact_id: '' })).contactId).toBeUndefined()
  })

  it('returns undefined taxAmount when zero', () => {
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
