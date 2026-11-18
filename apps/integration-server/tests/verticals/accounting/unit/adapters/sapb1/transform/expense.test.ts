import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type SapB1Expense,
  type SapB1ExpenseLine,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/expense'

function makeExpenseLine(overrides: Partial<SapB1ExpenseLine> = {}): SapB1ExpenseLine {
  return {
    ItemCode: 'ITEM-001',
    ItemDescription: 'Office supplies',
    Quantity: 1,
    UnitPrice: 50,
    LineTotal: 50,
    AccountCode: 'ACCT-001',
    ...overrides,
  }
}

function makeExpense(overrides: Partial<SapB1Expense> = {}): SapB1Expense {
  return {
    DocNum: 3001,
    CardCode: 'BP-001',
    DocDate: '2024-03-01',
    DocCurrency: 'USD',
    DocTotal: 250,
    VatSum: 50,
    Remarks: 'Travel expenses',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps DocNum as string to id', () => {
    expect(transformExpense(makeExpense()).id).toBe('3001')
  })

  it('maps CardCode to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('BP-001')
  })

  it('maps DocCurrency to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('maps DocTotal to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(250)
  })

  it('maps VatSum to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(50)
  })

  it('parses DocDate as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('sets postedAt to undefined when DocDate is empty', () => {
    expect(transformExpense(makeExpense({ DocDate: '' })).postedAt).toBeUndefined()
  })

  it('maps DocumentLines to lineItems', () => {
    const result = transformExpense(makeExpense({ DocumentLines: [makeExpenseLine()] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('ITEM-001')
    expect(result.lineItems![0].unitAmount).toBe(50)
    expect(result.lineItems![0].totalAmount).toBe(50)
  })

  it('produces empty lineItems when DocumentLines is absent', () => {
    expect(transformExpense(makeExpense()).lineItems).toHaveLength(0)
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
