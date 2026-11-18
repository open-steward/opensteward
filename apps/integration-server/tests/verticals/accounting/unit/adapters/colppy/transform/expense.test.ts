import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ColppyExpense } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/expense'

function makeExpense(overrides: Partial<ColppyExpense> = {}): ColppyExpense {
  return {
    idGasto: 400,
    descripcion: 'Material de oficina',
    idProveedor: 15,
    total: 3500,
    iva: 735,
    moneda: 'ARS',
    fechaEmision: '2025-04-10',
    items: [
      {
        idItem: 1,
        idCuenta: 30,
        descripcion: 'Resma papel',
        total: 3500,
        iva: 735,
      },
    ],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('400')
    expect(result.name).toBe('Material de oficina')
    expect(result.contactId).toBe('15')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(3500)
    expect(result.taxAmount).toBe(735)
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps line items correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].accountId).toBe('30')
    expect(result.lineItems![0].totalAmount).toBe(3500)
  })

  it('maps postedAt date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2025-04-10'))
  })

  it('returns undefined name when descripcion is empty', () => {
    const result = transformExpense(makeExpense({ descripcion: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
