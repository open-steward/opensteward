import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type XubioExpense } from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/expense'

function makeExpense(overrides: Partial<XubioExpense> = {}): XubioExpense {
  return {
    id: 500,
    descripcion: 'Compra de suministros',
    proveedorId: 70,
    total: 8000,
    impuestos: 1680,
    moneda: 'ARS',
    fechaEmision: '2025-05-15',
    lineas: [
      {
        id: 1,
        cuentaId: 'ACC-5',
        descripcion: 'Papel A4',
        total: 8000,
        impuesto: 1680,
      },
    ],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('500')
    expect(result.name).toBe('Compra de suministros')
    expect(result.contactId).toBe('70')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(8000)
    expect(result.taxAmount).toBe(1680)
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
    expect(result.lineItems![0].accountId).toBe('ACC-5')
    expect(result.lineItems![0].totalAmount).toBe(8000)
  })

  it('maps date correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2025-05-15'))
  })

  it('returns undefined contactId when proveedorId is 0', () => {
    const result = transformExpense(makeExpense({ proveedorId: 0 }))
    expect(result.contactId).toBeUndefined()
  })

  it('handles empty lineas', () => {
    const result = transformExpense(makeExpense({ lineas: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
