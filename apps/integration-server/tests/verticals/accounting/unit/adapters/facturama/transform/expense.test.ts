import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type FacturamaExpense } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/expense'

function makeRaw(overrides: Partial<FacturamaExpense> = {}): FacturamaExpense {
  return {
    Id: 'exp-1',
    Description: 'Office supplies',
    SupplierId: 'supp-1',
    Currency: 'MXN',
    Total: 300,
    TaxAmount: 48,
    Date: '2024-03-15',
    Items: [],
    ...overrides,
  }
}

describe('facturama transformExpense', () => {
  it('maps Id to id', () => {
    expect(transformExpense(makeRaw()).id).toBe('exp-1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformExpense(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformExpense(raw).metadata).toBe(raw)
  })
  it('maps Description to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('Office supplies')
  })
  it('maps Date to postedAt as Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toEqual(new Date('2024-03-15'))
  })
  it('maps SupplierId to contactId', () => {
    expect(transformExpense(makeRaw()).contactId).toBe('supp-1')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
