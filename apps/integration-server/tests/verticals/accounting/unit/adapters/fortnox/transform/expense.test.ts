import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type FortnoxExpense,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/expense'

function makeExpense(overrides: Partial<FortnoxExpense> = {}): FortnoxExpense {
  return {
    DocumentNumber: 'E001',
    Description: 'Office supplies',
    SupplierNumber: 'SUPP042',
    Total: 1250,
    VAT: 250,
    Currency: 'SEK',
    InvoiceDate: '2024-02-01',
    ExpenseRows: [],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps DocumentNumber to id', () => {
    expect(transformExpense(makeExpense()).id).toBe('E001')
  })

  it('maps Description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('maps SupplierNumber to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('SUPP042')
  })

  it('maps Total to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(125000)
  })

  it('maps VAT to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(25000)
  })

  it('maps Currency to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('SEK')
  })

  it('maps InvoiceDate to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-02-01')).toBe(true)
  })

  it('returns undefined postedAt when InvoiceDate is empty', () => {
    expect(transformExpense(makeExpense({ InvoiceDate: '' })).postedAt).toBeUndefined()
  })

  it('maps ExpenseRows to lineItems', () => {
    const raw = makeExpense({
      ExpenseRows: [
        { RowId: 1, AccountNumber: '5410', Description: 'Paper', Total: 1000, VAT: 200 },
      ],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].accountId).toBe('5410')
    expect(result.lineItems![0].totalAmount).toBe(100000)
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
