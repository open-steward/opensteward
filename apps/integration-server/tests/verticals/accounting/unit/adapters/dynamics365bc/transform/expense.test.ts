import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type BCExpense } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/expense'

function makeExpense(overrides: Partial<BCExpense> = {}): BCExpense {
  return {
    id: 'exp-1',
    number: 'PI-200',
    vendorId: 'vendor-2',
    vendorName: 'Supplier Inc',
    totalAmountIncludingTax: 500,
    totalTaxAmount: 50,
    currencyCode: 'USD',
    invoiceDate: '2024-02-10',
    ...overrides,
  }
}

describe('transformExpense (dynamics365bc)', () => {
  it('maps id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-1')
  })

  it('maps contactId from vendorId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('vendor-2')
  })

  it('maps totalAmount and taxAmount', () => {
    const result = transformExpense(makeExpense())
    expect(result.totalAmount).toBe(500)
    expect(result.taxAmount).toBe(50)
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense({ currencyCode: 'EUR' })).currency).toBe('EUR')
  })

  it('maps postedAt from invoiceDate', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-02-10'))
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
