import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type VismaExpense } from '../../../../../../../src/verticals/accounting/adapters/visma/transform/expense'

function makeExpense(overrides: Partial<VismaExpense> = {}): VismaExpense {
  return {
    Id: 'expense-uuid-1234',
    SupplierId: 'supp-uuid-5678',
    SupplierNumber: 'S001',
    Description: 'Office supplies',
    CurrencyCode: 'SEK',
    TotalAmount: 2500,
    VatAmount: 500,
    InvoiceDate: '2024-04-10',
    Rows: [
      {
        LineNumber: 1,
        AccountNumber: 6110,
        Text: 'Printer paper',
        TotalAmount: 2000,
        TotalVatAmount: 500,
        CostCenterItemId1: '',
        ProjectId: '',
      },
    ],
    CreatedUtc: '2024-04-10T09:00:00Z',
    ModifiedUtc: '2024-04-10T09:30:00Z',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('expense-uuid-1234')
    expect(result.name).toBe('Office supplies')
    expect(result.contactId).toBe('supp-uuid-5678')
    expect(result.currency).toBe('SEK')
    expect(result.totalAmount).toBe(2500)
    expect(result.taxAmount).toBe(500)
  })

  it('parses invoice date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-04-10'))
  })

  it('maps lineItems', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('6110')
    expect(li.itemDescription).toBe('Printer paper')
    expect(li.totalAmount).toBe(2000)
    expect(li.taxAmount).toBe(500)
  })

  it('passes raw object through as metadata', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing description', () => {
    const result = transformExpense(makeExpense({ Description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
