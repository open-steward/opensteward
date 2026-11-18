import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type SevDeskPart,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/expense'

function makeExpense(overrides: Partial<SevDeskPart> = {}): SevDeskPart {
  return {
    id: 'exp-1',
    description: 'Office supplies',
    accountingType: { id: 'at-10' },
    createDate: '2024-05-01',
    currency: 'EUR',
    sumNet: '100.00',
    sumGross: '119.00',
    sumTax: '19.00',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id correctly', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-1')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps accountingType id to accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('at-10')
  })

  it('maps currency correctly', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('parses sumGross as totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(119)
  })

  it('parses sumTax as taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(19)
  })

  it('parses createDate as Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-05-01'))
  })

  it('handles null accountingType', () => {
    expect(transformExpense(makeExpense({ accountingType: null })).accountId).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
