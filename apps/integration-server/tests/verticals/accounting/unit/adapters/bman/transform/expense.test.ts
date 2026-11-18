import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type BmanSpesa } from '../../../../../../../src/verticals/accounting/adapters/bman/transform/expense'

function makeExpense(overrides: Partial<BmanSpesa> = {}): BmanSpesa {
  return {
    id: 'exp-1',
    descrizione: 'Office supplies',
    fornitore_id: 'supplier-1',
    valuta: 'EUR',
    iva: 200,
    totale: 1200,
    data: '2024-01-15',
    righe: [],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id field', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-1')
  })

  it('maps key fields', () => {
    const result = transformExpense(makeExpense())
    expect(result.name).toBe('Office supplies')
    expect(result.contactId).toBe('supplier-1')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
  })

  it('maps date field as Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps righe to lineItems', () => {
    const raw = makeExpense({
      righe: [{ id: 'line-1', conto: 'ACC-1', descrizione: 'Paper', totale: 500, iva: 100 }],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-1')
    expect(li.accountId).toBe('ACC-1')
    expect(li.totalAmount).toBe(500)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
