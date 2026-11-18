import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformExpense,
  type CraterExpense,
} from '../../../../../../../src/verticals/accounting/adapters/crater/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<CraterExpense> = {}): CraterExpense {
  return {
    id: 'exp-7',
    expense_date: '2026-03-15',
    amount: 5000,
    notes: 'Office supplies',
    expense_category_id: 'cat-99',
    customer_business_id: 'biz-12',
    user_id: 'user-3',
    payment_method: 'BANK_TRANSFER',
    currency: { code: 'USD' },
    items: [],
    created_at: '2026-03-15T10:00:00.000Z',
    updated_at: '2026-03-15T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformExpense (crater)', () => {
  it('maps id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-7')
  })

  it('maps accountId from expense_category_id', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('cat-99')
  })

  it('maps contactId from customer_business_id', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('biz-12')
  })

  it('maps currency from currency.code', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('maps totalAmount as-is (already minor units)', () => {
    expect(transformExpense(makeExpense({ amount: 5000 })).totalAmount).toBe(5000)
  })

  it('maps paymentMethod', () => {
    expect(transformExpense(makeExpense()).paymentMethod).toBe('BANK_TRANSFER')
  })

  it('parses expense_date as postedAt Date', () => {
    const result = transformExpense(makeExpense({ expense_date: '2026-03-15' }))
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2026-03-15')).toBe(true)
  })

  it('omits contactId when customer_business_id is null', () => {
    expect(transformExpense(makeExpense({ customer_business_id: null })).contactId).toBeUndefined()
  })

  it('maps line items', () => {
    const result = transformExpense(
      makeExpense({
        items: [
          { id: 'li-1', expense_category_name: 'Supplies', description: 'Paper', amount: 1000 },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Supplies')
    expect(result.lineItems![0].totalAmount).toBe(1000)
  })

  it('attaches raw as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('passes ExpenseSchema.parse without throwing', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
