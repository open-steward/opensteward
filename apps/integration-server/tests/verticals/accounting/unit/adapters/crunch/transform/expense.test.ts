import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformExpense,
  type CrunchExpenseDto,
} from '../../../../../../../src/verticals/accounting/adapters/crunch/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<CrunchExpenseDto> = {}): CrunchExpenseDto {
  return {
    id: 20,
    supplier: { id: 5, companyName: 'Acme Supplies' },
    note: 'Monthly supplies',
    expenseLineItems: [
      {
        id: 1,
        description: 'Notebooks',
        amount: { grossAmount: 60, netAmount: 50, vatAmount: 10 },
      },
    ],
    supplierPayments: [
      {
        id: 1,
        date: '2026-04-10',
        amount: 60,
        paymentTarget: { paymentMethod: { paymentMethodName: 'BACS' } },
      },
    ],
    postingDate: '2026-04-05',
    status: 'APPROVED',
    outstandingBalance: 0,
    ...overrides,
  }
}

describe('transformExpense (crunch)', () => {
  it('maps id to string', () => {
    expect(transformExpense(makeExpense()).id).toBe('20')
  })

  it('prefixes supplier id with sup_', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('sup_5')
  })

  it('converts line item grossAmount (float) to minor units for totalAmount', () => {
    // grossAmount=60 → 6000
    expect(transformExpense(makeExpense()).totalAmount).toBe(6000)
  })

  it('converts vatAmount to taxAmount in minor units', () => {
    // vatAmount=10 → 1000
    expect(transformExpense(makeExpense()).taxAmount).toBe(1000)
  })

  it('maps paymentMethod from first supplier payment', () => {
    expect(transformExpense(makeExpense()).paymentMethod).toBe('BACS')
  })

  it('parses postingDate as postedAt', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2026-04-05')).toBe(true)
  })

  it('maps line items with description and amounts', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Notebooks')
    expect(result.lineItems![0].totalAmount).toBe(6000)
  })

  it('omits taxAmount when vatAmount results in zero', () => {
    const result = transformExpense(
      makeExpense({
        expenseLineItems: [
          { id: 2, description: 'Zero VAT item', amount: { grossAmount: 100, vatAmount: 0 } },
        ],
      }),
    )
    expect(result.taxAmount).toBeUndefined()
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
