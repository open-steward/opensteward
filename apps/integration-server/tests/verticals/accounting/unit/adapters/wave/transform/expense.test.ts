import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type WaveExpense,
} from '../../../../../../../src/verticals/accounting/adapters/wave/transform/expense'

function makeExpense(overrides: Partial<WaveExpense> = {}): WaveExpense {
  return {
    id: 'exp-001',
    description: 'Office supplies',
    accountId: 'acc-1',
    vendor: { id: 'vendor-1' },
    currency: { code: 'CAD' },
    taxAmount: 13,
    totalAmount: 113,
    expenseDate: '2024-03-15',
    createdAt: '2024-03-15T10:00:00Z',
    modifiedAt: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from raw id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-001')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('acc-1')
  })

  it('maps vendor.id to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('vendor-1')
  })

  it('maps currency.code to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('CAD')
  })

  it('maps taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(13)
  })

  it('maps totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(113)
  })

  it('maps expenseDate to postedAt', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined contactId when vendor is null', () => {
    expect(transformExpense(makeExpense({ vendor: null })).contactId).toBeUndefined()
  })

  it('returns undefined name when description is empty', () => {
    expect(transformExpense(makeExpense({ description: '' })).name).toBeUndefined()
  })

  it('returns undefined taxAmount when taxAmount is 0', () => {
    expect(transformExpense(makeExpense({ taxAmount: 0 })).taxAmount).toBeUndefined()
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
