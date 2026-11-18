import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type PleoExpense,
} from '../../../../../../../src/verticals/accounting/adapters/pleo/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeRaw(overrides: Partial<PleoExpense> = {}): PleoExpense {
  return {
    id: 'pleo-exp-1',
    employeeId: 'emp-10',
    performedAt: '2025-06-05T14:30:00.000Z',
    amountOriginal: { value: 5000, currency: 'DKK' },
    amountSettled: { value: 4800, currency: 'DKK' },
    type: 'card',
    status: 'settled',
    accountId: 'acct-3',
    lines: [
      {
        id: 'l-1',
        accountId: 'acct-3',
        description: 'Software subscription',
        amount: { value: 4800, currency: 'DKK' },
      },
    ],
    createdAt: '2025-06-05T14:30:00.000Z',
    updatedAt: '2025-06-06T08:00:00.000Z',
    ...overrides,
  }
}

describe('pleo transformExpense', () => {
  it('maps id', () => {
    expect(transformExpense(makeRaw()).id).toBe('pleo-exp-1')
  })

  it('maps employeeId to userId', () => {
    expect(transformExpense(makeRaw()).userId).toBe('emp-10')
  })

  it('maps accountId', () => {
    expect(transformExpense(makeRaw()).accountId).toBe('acct-3')
  })

  it('uses settled currency', () => {
    expect(transformExpense(makeRaw()).currency).toBe('DKK')
  })

  it('uses settled amount directly (already minor units)', () => {
    // Pleo amounts are already in minor units — no ×100 conversion
    expect(transformExpense(makeRaw()).totalAmount).toBe(4800)
  })

  it('falls back to original amount when settled absent', () => {
    expect(transformExpense(makeRaw({ amountSettled: undefined })).totalAmount).toBe(5000)
  })

  it('maps type to paymentMethod', () => {
    expect(transformExpense(makeRaw()).paymentMethod).toBe('card')
  })

  it('maps performedAt to postedAt Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('maps line description to itemDescription', () => {
    const result = transformExpense(makeRaw())
    expect(result.lineItems?.[0]?.itemDescription).toBe('Software subscription')
  })

  it('maps line amount value directly', () => {
    const result = transformExpense(makeRaw())
    expect(result.lineItems?.[0]?.totalAmount).toBe(4800)
  })

  it('passes ExpenseSchema.parse', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeRaw()))).not.toThrow()
  })
})
