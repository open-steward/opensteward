import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type ZohoBooksExpense,
  type ZohoBooksExpenseLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/expense'

function makeExpenseLineItem(overrides: Partial<ZohoBooksExpenseLineItem> = {}): ZohoBooksExpenseLineItem {
  return {
    line_item_id: 'li-1',
    account_id: 'acct-30',
    description: 'Flight to NYC',
    quantity: 1,
    unit_price: 450,
    item_total: 450,
    ...overrides,
  }
}

function makeExpense(overrides: Partial<ZohoBooksExpense> = {}): ZohoBooksExpense {
  return {
    expense_id: 'exp-001',
    date: '2024-05-20',
    account_id: 'acct-10',
    vendor_id: 'vendor-77',
    currency_code: 'USD',
    total: 450,
    tax_total: 0,
    description: 'Business travel',
    status: 'unbilled',
    line_items: [makeExpenseLineItem()],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps expense_id to id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-001')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Business travel')
  })

  it('maps account_id to accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('acct-10')
  })

  it('maps vendor_id to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('vendor-77')
  })

  it('maps currency_code to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(450)
  })

  it('parses date as postedAt Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-05-20'))
  })

  it('maps line_items to lineItems', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Flight to NYC')
    expect(result.lineItems![0].unitQuantity).toBe(1)
    expect(result.lineItems![0].totalAmount).toBe(450)
  })

  it('produces empty lineItems when line_items is absent', () => {
    const result = transformExpense(makeExpense({ line_items: undefined }))
    expect(result.lineItems).toHaveLength(0)
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
