import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type MossExpense,
  type MossExpenseLine,
} from '../../../../../../../src/verticals/accounting/adapters/moss/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

const sampleLine: MossExpenseLine = {
  id: 'line-001',
  expenseAccountId: 'acct-001',
  description: 'Hotel stay',
  taxRateId: 'vat-01',
  netAmount: { amount: '100.00', currency: 'EUR' },
  vatAmount: { amount: '19.00', currency: 'EUR' },
  grossAmount: { amount: '119.00', currency: 'EUR' },
  quantity: 1,
  unitPrice: { amount: '100.00', currency: 'EUR' },
}

function makeRaw(overrides: Partial<MossExpense> = {}): MossExpense {
  return {
    id: 'exp-001',
    createTime: '2024-03-01T10:00:00.000Z',
    updateTime: '2024-03-02T10:00:00.000Z',
    expenseTime: '2024-03-01T09:00:00.000Z',
    description: 'Business trip',
    supplierId: 'sup-001',
    createdBy: 'user-001',
    homeAmount: { amount: '119.00', currency: 'EUR' },
    status: 'APPROVED',
    lines: [sampleLine],
    ...overrides,
  }
}

describe('transformExpense (moss)', () => {
  it('maps id', () => {
    expect(transformExpense(makeRaw()).id).toBe('exp-001')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('Business trip')
  })

  it('maps supplierId to contactId', () => {
    expect(transformExpense(makeRaw()).contactId).toBe('sup-001')
  })

  it('maps homeAmount currency', () => {
    expect(transformExpense(makeRaw()).currency).toBe('EUR')
  })

  it('parses homeAmount to minor units (119.00 → 11900)', () => {
    expect(transformExpense(makeRaw()).totalAmount).toBe(11900)
  })

  it('sums vatAmount across lines for taxAmount (19.00 → 1900)', () => {
    expect(transformExpense(makeRaw()).taxAmount).toBe(1900)
  })

  it('maps expenseTime to postedAt', () => {
    expect(transformExpense(makeRaw()).postedAt).toEqual(new Date('2024-03-01T09:00:00.000Z'))
  })

  it('maps lineitem totalAmount from grossAmount (119.00 → 11900)', () => {
    const e = transformExpense(makeRaw())
    expect(e.lineItems![0].totalAmount).toBe(11900)
  })

  it('maps lineitem accountId', () => {
    expect(transformExpense(makeRaw()).lineItems![0].accountId).toBe('acct-001')
  })

  it('passes ExpenseSchema.parse without throwing', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeRaw()))).not.toThrow()
  })

  it('handles no lines gracefully', () => {
    const e = transformExpense(makeRaw({ lines: [] }))
    expect(e.lineItems).toBeUndefined()
    expect(e.taxAmount).toBeUndefined()
  })
})
