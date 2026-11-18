import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type LexofficeExpense,
  type LexofficeExpenseItem,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/expense'

function makeExpenseItem(overrides: Partial<LexofficeExpenseItem> = {}): LexofficeExpenseItem {
  return {
    amount: 100,
    taxRatePercent: 19,
    categoryId: 'cat-uuid-001',
    ...overrides,
  }
}

function makeExpense(overrides: Partial<LexofficeExpense> = {}): LexofficeExpense {
  return {
    id: 'expense-uuid-001',
    description: 'Office supplies purchase',
    contactId: 'vendor-uuid-001',
    voucherDate: '2024-03-10',
    currency: 'EUR',
    totalGrossAmount: 119,
    totalTaxAmount: 19,
    voucherItems: [makeExpenseItem()],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id correctly', () => {
    expect(transformExpense(makeExpense()).id).toBe('expense-uuid-001')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies purchase')
  })

  it('maps contactId correctly', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('vendor-uuid-001')
  })

  it('maps currency correctly', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('maps totalGrossAmount to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(119)
  })

  it('maps totalTaxAmount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(19)
  })

  it('parses voucherDate as Date object for postedAt', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps voucherItems to lineItems', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(100)
    expect(result.lineItems![0].accountId).toBe('cat-uuid-001')
  })

  it('returns undefined lineItems when voucherItems is absent', () => {
    const result = transformExpense(makeExpense({ voucherItems: undefined }))
    expect(result.lineItems).toBeUndefined()
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
