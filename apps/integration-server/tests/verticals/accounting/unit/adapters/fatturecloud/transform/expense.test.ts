import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type FattureCloudExpense } from '../../../../../../../src/verticals/accounting/adapters/fatturecloud/transform/expense'

function makeExpense(overrides: Partial<FattureCloudExpense> = {}): FattureCloudExpense {
  return { id: 50, entity: { id: 5 }, date: '2024-06-01', currency: { id: 'EUR' }, totals: { amount: 300, vat_amount: 55 }, description: 'Spesa ufficio', ...overrides }
}

describe('transformExpense (fatturecloud)', () => {
  it('maps id and contactId', () => {
    expect(transformExpense(makeExpense()).id).toBe('50')
    expect(transformExpense(makeExpense()).contactId).toBe('5')
  })
  it('maps totalAmount and taxAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(300)
    expect(transformExpense(makeExpense()).taxAmount).toBe(55)
  })
  it('maps name from description', () => { expect(transformExpense(makeExpense()).name).toBe('Spesa ufficio') })
  it('passes raw as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
