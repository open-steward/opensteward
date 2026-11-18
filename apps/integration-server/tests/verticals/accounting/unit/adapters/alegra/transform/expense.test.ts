import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type AlegraExpense } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/expense'

function makeExpense(overrides: Partial<AlegraExpense> = {}): AlegraExpense {
  return {
    id: 30,
    name: 'Office supplies',
    providerId: 4,
    total: 3000,
    totalTax: 480,
    currency: 'COP',
    date: '2024-01-15',
    items: [],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id to string', () => {
    expect(transformExpense(makeExpense()).id).toBe('30')
  })

  it('maps name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps providerId to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('4')
  })

  it('maps total amounts', () => {
    const result = transformExpense(makeExpense())
    expect(result.totalAmount).toBe(3000)
    expect(result.taxAmount).toBe(480)
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('COP')
  })

  it('maps date as Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps lineItems from items', () => {
    const raw = makeExpense({
      items: [{ id: 1, accountId: 100, description: 'Paper', total: 1500, tax: 240 }],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].accountId).toBe('100')
    expect(result.lineItems![0].itemDescription).toBe('Paper')
    expect(result.lineItems![0].totalAmount).toBe(1500)
    expect(result.lineItems![0].taxAmount).toBe(240)
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
