import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ContabiliumExpense } from '../../../../../../../src/verticals/accounting/adapters/contabilium/transform/expense'

function makeExpense(overrides: Partial<ContabiliumExpense> = {}): ContabiliumExpense {
  return {
    id: 35,
    descripcion: 'Alquiler oficina',
    proveedorId: 9,
    moneda: 'ARS',
    total: 15000,
    impuestos: 3150,
    fechaEmision: '2024-01-15',
    items: [],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id to string', () => {
    expect(transformExpense(makeExpense()).id).toBe('35')
  })

  it('maps descripcion to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Alquiler oficina')
  })

  it('maps proveedorId to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('9')
  })

  it('maps amounts', () => {
    const result = transformExpense(makeExpense())
    expect(result.totalAmount).toBe(15000)
    expect(result.taxAmount).toBe(3150)
  })

  it('maps moneda to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('ARS')
  })

  it('maps fechaEmision to postedAt as Date object', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps lineItems from items', () => {
    const raw = makeExpense({
      items: [{ id: 1, cuentaId: 'ACC-001', descripcion: 'Servicio', total: 15000, impuesto: 3150 }],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('ACC-001')
    expect(result.lineItems![0].totalAmount).toBe(15000)
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
