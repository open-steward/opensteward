import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ContaAzulExpense } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/expense'

function makeExpense(overrides: Partial<ContaAzulExpense> = {}): ContaAzulExpense {
  return {
    id: 'exp-001',
    name: 'Material de escritorio',
    supplier_id: 'sup-50',
    total: 2500,
    tax_total: 450,
    currency: 'BRL',
    issue_date: '2025-04-15',
    items: [
      { id: 'li-1', account_id: 'acc-20', description: 'Papel A4', total: 2500, tax_amount: 450 },
    ],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('exp-001')
    expect(result.name).toBe('Material de escritorio')
    expect(result.contactId).toBe('sup-50')
    expect(result.currency).toBe('BRL')
    expect(result.totalAmount).toBe(2500)
    expect(result.taxAmount).toBe(450)
  })

  it('maps date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2025-04-15'))
  })

  it('maps line items', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('acc-20')
    expect(result.lineItems?.[0].itemDescription).toBe('Papel A4')
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
