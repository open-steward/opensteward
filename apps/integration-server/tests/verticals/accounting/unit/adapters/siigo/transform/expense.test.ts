import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type SiigoExpense } from '../../../../../../../src/verticals/accounting/adapters/siigo/transform/expense'

function makeExpense(overrides: Partial<SiigoExpense> = {}): SiigoExpense {
  return {
    id: 700,
    name: 'Office Supplies',
    supplierId: 200,
    total: 3000,
    taxTotal: 570,
    currency: 'COP',
    date: '2025-05-10',
    items: [
      { id: 1, accountId: 10, description: 'Paper', total: 3000, taxAmount: 570 },
    ],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('700')
    expect(result.name).toBe('Office Supplies')
    expect(result.contactId).toBe('200')
    expect(result.currency).toBe('COP')
    expect(result.totalAmount).toBe(3000)
    expect(result.taxAmount).toBe(570)
  })

  it('maps date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2025-05-10'))
  })

  it('maps line items', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('10')
    expect(result.lineItems?.[0].itemDescription).toBe('Paper')
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
