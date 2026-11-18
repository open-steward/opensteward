import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type FakturoidExpense,
} from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/expense'

function makeExpense(overrides: Partial<FakturoidExpense> = {}): FakturoidExpense {
  return {
    id: 701,
    description: 'Office rent',
    subject_id: 42,
    currency: 'CZK',
    total: 15000,
    vat_price: 2625,
    issued_on: '2024-02-15',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from raw id as string', () => {
    expect(transformExpense(makeExpense()).id).toBe('701')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office rent')
  })

  it('maps subject_id to contactId as string', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('42')
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('CZK')
  })

  it('maps total to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(15000)
  })

  it('maps vat_price to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(2625)
  })

  it('maps issued_on to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-02-15')).toBe(true)
  })

  it('returns undefined postedAt when issued_on is empty', () => {
    expect(transformExpense(makeExpense({ issued_on: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when description is empty', () => {
    expect(transformExpense(makeExpense({ description: '' })).name).toBeUndefined()
  })

  it('returns undefined contactId when subject_id is 0', () => {
    expect(transformExpense(makeExpense({ subject_id: 0 })).contactId).toBeUndefined()
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
