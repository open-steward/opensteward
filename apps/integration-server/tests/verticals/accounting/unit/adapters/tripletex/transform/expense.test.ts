import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type TripletexTravelExpense,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/expense'

function makeExpense(overrides: Partial<TripletexTravelExpense> = {}): TripletexTravelExpense {
  return {
    id: 303,
    description: 'Oslo conference travel',
    employee: { id: 12, displayName: 'Kari Nordmann' },
    travelDetails: { departureDate: '2024-05-10' },
    amount: 800,
    amountCurrency: 800,
    currency: { id: '1', code: 'NOK' },
    isCompleted: false,
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id correctly', () => {
    expect(transformExpense(makeExpense()).id).toBe('303')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Oslo conference travel')
  })

  it('maps employee id to userId', () => {
    expect(transformExpense(makeExpense()).userId).toBe('12')
  })

  it('maps currency code correctly', () => {
    expect(transformExpense(makeExpense()).currency).toBe('NOK')
  })

  it('maps amountCurrency to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(800)
  })

  it('parses travelDetails departureDate as postedAt Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-05-10'))
  })

  it('sets postedAt to undefined when travelDetails is absent', () => {
    expect(transformExpense(makeExpense({ travelDetails: undefined })).postedAt).toBeUndefined()
  })

  it('sets userId to undefined when employee is absent', () => {
    expect(transformExpense(makeExpense({ employee: undefined })).userId).toBeUndefined()
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
