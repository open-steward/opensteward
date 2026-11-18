import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ChipaxExpense } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/expense'

function makeExpense(overrides: Partial<ChipaxExpense> = {}): ChipaxExpense {
  return {
    id: 300,
    descripcion: 'Materiales oficina',
    proveedorId: 20,
    moneda: 'CLP',
    total: 75000,
    impuesto: 14250,
    fechaEmision: '2025-02-10',
    lineas: [
      {
        id: 1,
        cuentaId: '5100',
        descripcion: 'Papel',
        total: 75000,
        impuesto: 14250,
      },
    ],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('300')
    expect(result.name).toBe('Materiales oficina')
    expect(result.contactId).toBe('20')
    expect(result.currency).toBe('CLP')
    expect(result.totalAmount).toBe(75000)
    expect(result.taxAmount).toBe(14250)
  })

  it('maps line items', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('5100')
    expect(result.lineItems![0].itemDescription).toBe('Papel')
  })

  it('maps postedAt from fechaEmision', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2025-02-10'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined contactId when proveedorId is 0', () => {
    const result = transformExpense(makeExpense({ proveedorId: 0 }))
    expect(result.contactId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
