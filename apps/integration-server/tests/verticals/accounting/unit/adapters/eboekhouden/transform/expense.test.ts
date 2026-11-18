import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type EBoekhoudenExpense } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/expense'

function makeExpense(overrides: Partial<EBoekhoudenExpense> = {}): EBoekhoudenExpense {
  return {
    id: 300,
    invoiceNumber: 'KOST-001',
    relationId: 42,
    totalInclTax: 605,
    taxAmount: 105,
    date: '2024-02-15',
    currency: 'EUR',
    description: 'Kantoorbenodigdheden',
    ...overrides,
  }
}

describe('transformExpense (eboekhouden)', () => {
  it('maps id', () => {
    expect(transformExpense(makeExpense()).id).toBe('300')
  })

  it('maps contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('42')
  })

  it('maps totalAmount and taxAmount', () => {
    const result = transformExpense(makeExpense())
    expect(result.totalAmount).toBe(605)
    expect(result.taxAmount).toBe(105)
  })

  it('maps name from description', () => {
    expect(transformExpense(makeExpense()).name).toBe('Kantoorbenodigdheden')
  })

  it('maps postedAt from date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-02-15'))
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
