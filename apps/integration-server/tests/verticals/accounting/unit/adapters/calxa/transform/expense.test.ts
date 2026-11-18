import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type CalxaExpense,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<CalxaExpense> = {}): CalxaExpense {
  return {
    id: 'exp-001',
    name: 'Client Travel',
    contactId: 'contact-42',
    currency: 'USD',
    taxAmount: 25,
    total: 275,
    date: '2024-03-15',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id as-is', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-001')
  })

  it('maps name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Client Travel')
  })

  it('maps contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('contact-42')
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('maps taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(25)
  })

  it('maps total to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(275)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined postedAt when date is undefined', () => {
    expect(transformExpense(makeExpense({ date: undefined })).postedAt).toBeUndefined()
  })

  it('returns undefined name when name is undefined', () => {
    expect(transformExpense(makeExpense({ name: undefined })).name).toBeUndefined()
  })

  it('maps createdAt to Date', () => {
    const result = transformExpense(makeExpense({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformExpense(makeExpense({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeExpense()))).not.toThrow()
  })
})
